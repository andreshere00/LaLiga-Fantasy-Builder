"""Exercise release activation with fake cloud commands and private runtime files."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "deploy-images.sh"
SHA = "a" * 40
REGISTRY = "us-central1-docker.pkg.dev/fantasy-test/fantasybuilder"
SERVICES = ("identity", "auth", "api", "scraping", "frontend")

# ---- Mocks, fixtures & helpers ---- #


class DeployImagesTests(unittest.TestCase):
    """Verify configuration preservation and fail-closed activation ordering."""

    def setUp(self) -> None:
        """Create fake gcloud, gh and curl executables in an isolated folder."""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.log = self.folder / "calls"
        self.runtime = self.folder / "original.env"
        self.runtime.write_bytes(
            b'# Keep exact bytes\r\nPASSWORD="private-$value"\r\n'
            + b"".join(f"{name.upper()}_IMAGE=old\r\n".encode() for name in SERVICES)
            + b"OTHER_SECRET='keep me'"
        )
        self.manifest = self.folder / "release-images.env"
        self.manifest.write_text(
            "".join(
                f"{name.upper()}_IMAGE={REGISTRY}/{name}@sha256:{'b' * 64}\n" for name in SERVICES
            )
        )
        commands = {
            "gh": '#!/bin/bash\nprintf "%s\\n" "$MAIN_SHA"\n',
            "curl": '#!/bin/bash\necho health >> "$CALL_LOG"\nexit "${FAIL_HEALTH:-0}"\n',
            "gcloud": """#!/bin/bash
set -eu
if [[ "$1 $2" == 'compute ssh' ]]; then
  if [[ "${@: -1}" == *'test -x'* ]]; then
    echo preflight >> "$CALL_LOG"
    exit "${FAIL_SSH:-0}"
  fi
  echo deploy >> "$CALL_LOG"
  exit "${FAIL_DEPLOY:-0}"
elif [[ "$1 $2 $3" == 'secrets versions access' ]]; then
  echo access >> "$CALL_LOG"
  for arg in "$@"; do
    if [[ "$arg" == --out-file=* ]]; then cp "$ORIGINAL_ENV" "${arg#*=}"; fi
  done
elif [[ "$1 $2 $3" == 'secrets versions add' ]]; then
  echo add >> "$CALL_LOG"
  for arg in "$@"; do
    if [[ "$arg" == --data-file=* ]]; then
      cp "${arg#*=}" "$CAPTURE_ENV"
      python3 -c 'import os,sys; assert os.stat(sys.argv[1]).st_mode & 0o777 == 0o600' "${arg#*=}"
    fi
  done
  exit "${FAIL_ADD:-0}"
else
  exit 99
fi
""",
        }
        for name, contents in commands.items():
            path = self.folder / name
            path.write_text(contents)
            path.chmod(0o700)
        self.env = {
            **os.environ,
            "PATH": f"{self.folder}:{os.environ['PATH']}",
            "CALL_LOG": str(self.log),
            "ORIGINAL_ENV": str(self.runtime),
            "CAPTURE_ENV": str(self.folder / "uploaded.env"),
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_SHA": SHA,
            "MAIN_SHA": SHA,
            "GITHUB_REPOSITORY": "example/fantasybuilder",
            "GCP_PROJECT_ID": "fantasy-test",
            "GCP_ARTIFACT_REGISTRY": REGISTRY,
            "GCP_DEPLOY_ZONE": "us-central1-a",
            "GCP_DEPLOY_INSTANCE": "fantasybuilder",
            "GCP_RUNTIME_SECRET": "fantasybuilder-runtime-env",
            "DEPLOY_URL": "https://example.com",
        }

    def deploy(self, **overrides: str) -> subprocess.CompletedProcess:
        """Run the real deployment script without cloud access."""
        return subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=self.folder,
            env={**self.env, **overrides},
            capture_output=True,
            text=True,
            check=False,
        )

    # ---- Happy path ---- #

    def test_deploy_valid_release_preserves_secrets_and_activates(self) -> None:
        """Replace images only, upload privately, activate, and check HTTPS in order."""
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.log.read_text().splitlines(), ["preflight", "access", "add", "deploy", "health"]
        )
        uploaded = (self.folder / "uploaded.env").read_bytes()
        self.assertTrue(uploaded.startswith(b'# Keep exact bytes\r\nPASSWORD="private-$value"\r\n'))
        self.assertTrue(uploaded.endswith(b"OTHER_SECRET='keep me'"))
        self.assertEqual(uploaded.count(b"@sha256:"), 5)
        self.assertNotIn("private-$value", result.stdout + result.stderr)

    # ---- Error paths ---- #

    def test_deploy_cloud_failures_stop_subsequent_steps(self) -> None:
        """SSH, upload, startup and HTTPS failures must fail the job without retries."""
        for variable, expected in [
            ("FAIL_SSH", ["preflight"]),
            ("FAIL_ADD", ["preflight", "access", "add"]),
            ("FAIL_DEPLOY", ["preflight", "access", "add", "deploy"]),
            ("FAIL_HEALTH", ["preflight", "access", "add", "deploy", "health"]),
        ]:
            with self.subTest(variable=variable):
                self.log.unlink(missing_ok=True)
                result = self.deploy(**{variable: "1"})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.log.read_text().splitlines(), expected)

    def test_deploy_invalid_manifests_never_upload_configuration(self) -> None:
        """Missing, duplicate, foreign-registry and shell entries fail before upload."""
        valid = self.manifest.read_text()
        for contents in [
            valid.splitlines()[0] + "\n",
            valid + valid.splitlines()[0] + "\n",
            valid.replace(REGISTRY, "evil.example/repo"),
            valid + "PASSWORD=$(echo exposed)\n",
        ]:
            with self.subTest(contents=contents):
                self.log.unlink(missing_ok=True)
                self.manifest.write_text(contents)
                self.assertNotEqual(self.deploy().returncode, 0)
                self.assertNotIn("add", self.log.read_text().splitlines())

    def test_deploy_duplicate_runtime_images_never_upload_configuration(self) -> None:
        """Ambiguous runtime assignments cannot silently override the selected release."""
        with self.runtime.open("ab") as target:
            target.write(b"\nexport API_IMAGE=another\n")
        self.assertNotEqual(self.deploy().returncode, 0)
        self.assertNotIn("add", self.log.read_text().splitlines())

    # ---- Edge cases ---- #

    def test_deploy_superseded_commit_skips_cloud_operations(self) -> None:
        """An old queued run cannot roll development back after a newer main push."""
        self.assertEqual(self.deploy(MAIN_SHA="c" * 40).returncode, 0)
        self.assertFalse(self.log.exists())

    def test_deploy_other_events_rejected_before_cloud_access(self) -> None:
        """Only main pushes may activate development."""
        for overrides in [
            {"GITHUB_EVENT_NAME": "pull_request"},
            {"GITHUB_REF": "refs/heads/feature"},
            {"GITHUB_REF": "refs/tags/v1"},
            {"GITHUB_SHA": "short"},
        ]:
            with self.subTest(overrides=overrides):
                self.assertNotEqual(self.deploy(**overrides).returncode, 0)
                self.assertFalse(self.log.exists())
