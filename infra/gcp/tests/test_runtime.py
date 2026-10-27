"""Exercise deployment boundaries without credentials, cloud calls, or a Docker daemon."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# ---- Mocks, fixtures & helpers ---- #


class RuntimeTests(unittest.TestCase):
    """Verify failure handling and the rendered container security boundary."""

    def setUp(self) -> None:
        """Create a private sandbox for host scripts and command doubles."""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name).resolve()
        self.config = self.folder / "config"
        self.config.mkdir()
        self.bin = self.folder / "bin"
        self.bin.mkdir()
        (self.config / "host.env").write_text(
            "PROJECT_ID=fantasybuilder-test\nSECRET_PREFIX=fantasybuilder\n"
            "APP_DOMAIN=example.com\nBACKUP_BUCKET=example-backups\nREGION=us-central1\n"
        )
        self.env = {**os.environ, "PATH": f"{self.bin}:{os.environ['PATH']}"}
        self.log = self.folder / "commands.log"
        self.env["COMMAND_LOG"] = str(self.log)

    def command(self, name: str, body: str) -> None:
        """Install a fake command that never contacts external services."""
        path = self.bin / name
        path.write_text(f"#!/bin/bash\nset -eu\n{body}\n")
        path.chmod(0o700)

    def script(self, name: str) -> Path:
        """Redirect absolute host paths into the sandbox."""
        contents = (ROOT / "templates" / f"{name}.sh").read_text()
        contents = contents.replace("/etc/fantasybuilder", str(self.config))
        contents = contents.replace("/var/lib/fantasybuilder-backup", str(self.folder / "backup"))
        contents = contents.replace(
            "/run/lock/fantasybuilder-operation.lock", str(self.folder / "lock")
        )
        contents = contents.replace("/proc/sys/kernel/random/uuid", str(self.folder / "uuid"))
        contents = contents.replace(
            "/usr/local/sbin/fantasybuilder-", str(self.bin / "fantasybuilder-")
        )
        path = self.folder / f"{name}.sh"
        path.write_text(contents)
        path.chmod(0o700)
        return path

    def previous_release(self) -> Path:
        """Create a saved active configuration that failed updates must preserve."""
        previous = self.config / "releases" / "previous"
        previous.mkdir(parents=True)
        for name in ["runtime", "identity", "auth", "api", "scraping"]:
            (previous / f"{name}.env").write_text("PREVIOUS=configuration\n")
        (self.config / "current").symlink_to(previous, target_is_directory=True)
        return previous

    def release_commands(self) -> None:
        """Install cloud/runtime doubles while exercising the actual release scripts."""
        payloads = self.folder / "payloads"
        payloads.mkdir()
        digest = "a" * 64
        (payloads / "runtime.env").write_text(
            "".join(
                f"{name}_IMAGE=example.invalid/{name.lower()}@sha256:{digest}\n"
                for name in ["IDENTITY", "AUTH", "API", "SCRAPING", "FRONTEND"]
            )
        )
        for name in ["identity", "auth", "api", "scraping"]:
            (payloads / f"{name}.env").write_text("CANDIDATE=configuration\n")
        self.command("flock", "exit 0")
        self.command("fantasybuilder-metadata-guard", "exit 0")
        (self.bin / "fantasybuilder-fetch-secrets").symlink_to(self.script("fetch-secrets"))
        self.command(
            "gcloud",
            'printf "gcloud %s\\n" "$*" >> "$COMMAND_LOG"\n'
            'for arg in "$@"; do\n'
            '  case "$arg" in\n'
            '    --out-file=*) output="${arg#--out-file=}";\n'
            f'      cp "{payloads}/$(basename "$output")" "$output" ;;\n'
            "  esac\n"
            "done",
        )
        self.command(
            "docker",
            'printf "docker %s\\n" "$*" >> "$COMMAND_LOG"\n'
            'case " $* " in\n'
            '  *" config "*) test "${FAIL_STAGE:-}" != config ;;\n'
            '  *" pull "*) test "${FAIL_STAGE:-}" != pull ;;\n'
            '  *" up "*) test "${FAIL_STAGE:-}" != up ;;\n'
            "esac",
        )

    # ---- Error paths ---- #

    def test_fetch_secrets_missing_payload_keeps_previous_configuration(self) -> None:
        """An incomplete Secret Manager release must not replace local files."""
        previous = self.previous_release()
        candidate = self.folder / "candidate"
        candidate.mkdir()
        self.command(
            "gcloud",
            'for arg in "$@"; do\n'
            '  case "$arg" in\n'
            "    --secret=fantasybuilder-auth-env) exit 42 ;;\n"
            '    --out-file=*) output="${arg#--out-file=}" ;;\n'
            "  esac\n"
            "done\nprintf 'NEW=configuration\\n' > \"$output\"",
        )
        result = subprocess.run(
            ["bash", str(self.script("fetch-secrets")), str(candidate)],
            env=self.env,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 42)
        self.assertTrue(
            all(path.read_text() == "PREVIOUS=configuration\n" for path in previous.glob("*.env"))
        )
        self.assertEqual((self.config / "current").resolve(), previous)

    def test_release_validation_failure_keeps_previous_configuration(self) -> None:
        """Invalid configuration must not replace a usable boot configuration."""
        previous = self.previous_release()
        self.release_commands()
        self.env["FAIL_STAGE"] = "config"
        result = subprocess.run(
            ["bash", str(self.script("release"))], env=self.env, capture_output=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.config / "current").resolve(), previous)
        self.assertNotIn(" pull", self.log.read_text())
        self.assertEqual(list((self.config / "releases").iterdir()), [previous])

    def test_release_pull_failure_keeps_previous_configuration(self) -> None:
        """A registry outage must not change saved configuration or running containers."""
        previous = self.previous_release()
        self.release_commands()
        self.env["FAIL_STAGE"] = "pull"
        result = subprocess.run(
            ["bash", str(self.script("release"))], env=self.env, capture_output=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.config / "current").resolve(), previous)
        self.assertNotIn(" up ", self.log.read_text())

    def test_release_unhealthy_candidate_keeps_active_pointer_and_recovery_files(self) -> None:
        """Partial container updates need inspectable recovery data, not a false commit."""
        previous = self.previous_release()
        self.release_commands()
        self.env["FAIL_STAGE"] = "up"
        result = subprocess.run(
            ["bash", str(self.script("release"))], env=self.env, capture_output=True
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.config / "current").resolve(), previous)
        candidates = list((self.config / "releases").glob("release.*"))
        self.assertEqual(len(candidates), 1)
        self.assertTrue((candidates[0] / "runtime.env").exists())

    def test_deploy_failed_initial_release_does_not_enable_boot(self) -> None:
        """First-boot activation must require a successful release."""
        self.command("id", "printf '0\\n'")
        self.command("fantasybuilder-release", "exit 42")
        self.command("systemctl", "exit 3")
        result = subprocess.run(
            ["bash", str(self.script("deploy"))], env=self.env, capture_output=True
        )
        self.assertEqual(result.returncode, 42)
        self.assertFalse((self.config / "enabled").exists())

    def test_backup_failed_dump_does_not_upload_partial_database(self) -> None:
        """Failed pg_dump output must never become a successful remote backup."""
        (self.config / "enabled").touch()
        (self.folder / "uuid").write_text("test-uuid")
        self.command("flock", "exit 0")
        self.command("docker", "printf 'partial dump'; exit 42")
        marker = self.folder / "uploaded"
        self.command("gcloud", f"touch '{marker}'")
        result = subprocess.run(
            ["bash", str(self.script("backup"))], env=self.env, capture_output=True
        )
        self.assertEqual(result.returncode, 42)
        self.assertFalse(marker.exists())
        self.assertFalse([path for path in self.folder.glob("backup.*") if path.is_dir()])

    def test_backup_second_dump_failure_uploads_neither_database(self) -> None:
        """Both local dumps must finish before any part of the pair is uploaded."""
        (self.config / "enabled").touch()
        (self.folder / "uuid").write_text("test-uuid")
        self.command("flock", "exit 0")
        self.command("docker", 'case "$*" in *fantasy_auth*) exit 42 ;; esac; printf "dump"')
        marker = self.folder / "uploaded"
        self.command("gcloud", f"touch '{marker}'")
        result = subprocess.run(
            ["bash", str(self.script("backup"))], env=self.env, capture_output=True
        )
        self.assertEqual(result.returncode, 42)
        self.assertFalse(marker.exists())

    # ---- Happy path ---- #

    def test_release_healthy_candidate_commits_private_configuration(self) -> None:
        """Only a healthy release becomes the all-files configuration snapshot."""
        previous = self.previous_release()
        self.release_commands()
        result = subprocess.run(
            ["bash", str(self.script("release"))], env=self.env, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        current = (self.config / "current").resolve()
        self.assertNotEqual(current, previous)
        for name in ["runtime", "identity", "auth", "api", "scraping"]:
            self.assertEqual((current / f"{name}.env").stat().st_mode & 0o777, 0o600)
        commands = self.log.read_text()
        self.assertLess(commands.index(" config "), commands.index(" pull"))
        self.assertLess(commands.index(" pull"), commands.index(" up "))

    def test_start_cached_release_does_not_contact_cloud_services(self) -> None:
        """Boot must use cached files and images during a cloud API outage."""
        self.previous_release()
        self.command("flock", "exit 0")
        self.command("fantasybuilder-metadata-guard", "exit 0")
        self.command("gcloud", "exit 42")
        self.command("docker", 'printf "%s\\n" "$*" >> "$COMMAND_LOG"')
        result = subprocess.run(
            ["bash", str(self.script("start"))], env=self.env, capture_output=True
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertIn("--pull never", self.log.read_text())

    @unittest.skipUnless(
        shutil.which("docker"), "Docker CLI is needed to render Compose, not to run containers"
    )
    def test_compose_render_exposes_only_gateway_and_scopes_credentials(self) -> None:
        """Render the real Compose model to check isolation across service boundaries."""
        runtime = self.folder / "runtime.env"
        values = {
            key: "fixture-only-not-a-real-secret"
            for key in [
                "POSTGRES_PASSWORD",
                "IDENTITY_DB_PASSWORD",
                "VAULT_DB_PASSWORD",
                "INTERNAL_SERVICE_TOKEN",
                "SCRAPING_SERVICE_TOKEN",
            ]
        }
        values["APP_DOMAIN"] = "example.com"
        values.update(
            {
                f"{name}_IMAGE": f"example.invalid/{name.lower()}:fixture"
                for name in ["IDENTITY", "AUTH", "API", "SCRAPING", "FRONTEND"]
            }
        )
        runtime.write_text("".join(f"{key}={value}\n" for key, value in values.items()))
        result = subprocess.run(
            [
                "docker",
                "compose",
                "--env-file",
                str(runtime),
                "-f",
                str(ROOT / "templates/compose.yml"),
                "config",
                "--no-env-resolution",
                "--format",
                "json",
            ],
            env=self.env,
            capture_output=True,
            text=True,
            check=True,
        )
        services = json.loads(result.stdout)["services"]
        self.assertEqual(
            [name for name, service in services.items() if service.get("ports")], ["gateway"]
        )
        self.assertEqual({port["target"] for port in services["gateway"]["ports"]}, {80, 443})
        for name in ["frontend", "identity", "scraping"]:
            self.assertNotIn("INTERNAL_SERVICE_TOKEN", services[name].get("environment", {}))
        for name in ["api", "scraping", "frontend"]:
            self.assertNotIn("DATABASE_URL", services[name].get("environment", {}))
        self.assertEqual(services["auth"]["environment"]["USE_MEMORY_STORE"], "false")
        self.assertEqual(
            services["identity"]["environment"]["BETTER_AUTH_URL"], "https://example.com"
        )
        self.assertEqual(services["identity-migrate"]["restart"], "no")
        self.assertNotIn("env_file", services["identity-migrate"])


if __name__ == "__main__":
    unittest.main()
