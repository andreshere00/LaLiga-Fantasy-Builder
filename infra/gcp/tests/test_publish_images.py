"""Exercise image publishing gates and complete release manifests without a registry."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "publish-images.sh"
SHA = "a" * 40
DIGEST = "b" * 64
REGISTRY = "us-central1-docker.pkg.dev/fantasy-test/fantasybuilder"

# ---- Mocks, fixtures & helpers ---- #


class PublishImagesTests(unittest.TestCase):
    """Check that only main pushes can produce a complete pinned release."""

    def setUp(self) -> None:
        """Create an isolated fake Docker executable."""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.log = self.folder / "docker.log"
        docker = self.folder / "docker"
        docker.write_text(
            "#!/bin/bash\nset -eu\n"
            'echo "$*" >> "$DOCKER_LOG"\n'
            'if [[ "$1" == push && "$*" == *"${FAIL_SERVICE:-never-match}"* ]]; then '
            "exit 1; fi\n"
            'if [[ "$1" == push ]]; then\n'
            '  echo "sha-$GITHUB_SHA: digest: sha256:$MOCK_DIGEST size: 2188"\n'
            "fi\n"
            'if [[ "$1" == image && -z "${MOCK_NO_REPO_DIGESTS:-}" ]]; then\n'
            '  image="${@: -1}"\n'
            '  if [[ -n "${MOCK_FOREIGN_DIGEST:-}" ]]; then\n'
            '    printf "other.example/%s@sha256:%s\\n" "${image##*/}" "$MOCK_FOREIGN_DIGEST"\n'
            "  fi\n"
            '  printf "%s@sha256:%s\\n" "${image%:sha-*}" "$MOCK_DIGEST"\n'
            "fi\n"
        )
        docker.chmod(0o700)
        self.env = {
            **os.environ,
            "PATH": f"{self.folder}:{os.environ['PATH']}",
            "DOCKER_LOG": str(self.log),
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_SHA": SHA,
            "GCP_ARTIFACT_REGISTRY": REGISTRY,
            "MOCK_DIGEST": DIGEST,
        }

    def publish(self, **overrides: str) -> subprocess.CompletedProcess:
        """Run the actual script with isolated commands and output files."""
        return subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.folder,
            env={**self.env, **overrides},
            capture_output=True,
            text=True,
            check=False,
        )

    # ---- Happy path ---- #

    def test_publish_main_push_returns_five_pinned_images(self) -> None:
        """A successful run emits all five digests and commit-specific push tags."""
        result = self.publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        expected = "".join(
            f"{service.upper()}_IMAGE={REGISTRY}/{service}@sha256:{DIGEST}\n"
            for service in ["identity", "auth", "api", "scraping", "frontend"]
        )
        self.assertEqual((self.folder / "release-images.env").read_text(), expected)
        self.assertEqual(self.log.read_text().count(f":sha-{SHA}"), 15)

    def test_publish_foreign_repo_digest_listed_first_uses_registry_digest(self) -> None:
        """A RepoDigests entry from another repository never becomes the pinned image."""
        result = self.publish(MOCK_FOREIGN_DIGEST="c" * 64)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = (self.folder / "release-images.env").read_text()
        self.assertNotIn("c" * 64, manifest)
        self.assertEqual(manifest.count(f"@sha256:{DIGEST}"), 5)

    def test_publish_empty_repo_digests_falls_back_to_push_output(self) -> None:
        """Image stores that omit RepoDigests still pin the digest the push reported."""
        result = self.publish(MOCK_NO_REPO_DIGESTS="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = (self.folder / "release-images.env").read_text()
        self.assertEqual(manifest.count(f"@sha256:{DIGEST}"), 5)

    # ---- Error paths ---- #

    def test_publish_non_main_events_rejected_without_docker(self) -> None:
        """PRs, tags, other branches, and manual dispatch cannot publish."""
        for event, ref in [
            ("pull_request", "refs/heads/main"),
            ("push", "refs/heads/feature"),
            ("push", "refs/tags/v1"),
            ("workflow_dispatch", "refs/heads/main"),
        ]:
            with self.subTest(event=event, ref=ref):
                result = self.publish(GITHUB_EVENT_NAME=event, GITHUB_REF=ref)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.log.exists())

    def test_publish_failed_push_emits_no_complete_manifest(self) -> None:
        """A partially uploaded release never produces a deployable artifact."""
        (self.folder / "release-images.env").write_text("OLD_RELEASE=stale\n")
        result = self.publish(FAIL_SERVICE="/api:")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.folder / "release-images.env").exists())
        self.assertNotIn("/frontend:", self.log.read_text())

    def test_publish_invalid_digest_emits_no_complete_manifest(self) -> None:
        """Registry output must be a full SHA-256 digest."""
        result = self.publish(MOCK_DIGEST="invalid")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.folder / "release-images.env").exists())

    # ---- Edge cases ---- #

    def test_publish_invalid_configuration_rejected_without_docker(self) -> None:
        """Malformed registry paths and SHAs fail before any image operation."""
        for overrides in [
            {"GCP_ARTIFACT_REGISTRY": ""},
            {"GCP_ARTIFACT_REGISTRY": "https://example.com/repository"},
            {"GITHUB_SHA": "short"},
        ]:
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.publish(**overrides).returncode, 0)
                self.assertFalse(self.log.exists())
