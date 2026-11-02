"""Exercise optional host radar scheduling without Docker, cloud access or credentials."""

# ---- Mocks, fixtures & helpers ---- #

import os
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "templates/radar-sync.sh"


def job(tmp_path, *, enabled=True, fail="", lock=False):
    """Build an isolated host with command doubles; no live operations can run."""
    binary = tmp_path / "bin"
    binary.mkdir()
    log = tmp_path / "commands.log"
    docker = binary / "docker"
    docker.write_text(
        '#!/bin/bash\nprintf "%s\\n" "$*" >> "$JOB_LOG"\n'
        'if [[ -n "${FAIL_STAGE:-}" && " $* " == *" $FAIL_STAGE "* ]]; then exit 17; fi\n'
    )
    docker.chmod(0o700)
    flock = binary / "flock"
    flock.write_text(f"#!/bin/bash\nexit {1 if lock else 0}\n")
    flock.chmod(0o700)
    data, review = tmp_path / "data", tmp_path / "review"
    data.mkdir()
    review.mkdir()
    config = tmp_path / "radar.env"
    config.write_text(
        f"RADAR_JOB_ENABLED={'true' if enabled else 'false'}\n"
        f"RADAR_SEASON=2026-27\nRADAR_MINIMUM_CATALOG_COUNT=750\n"
        f"RADAR_DATA_DIR={data}\nRADAR_REVIEW_DIR={review}\n"
        "RADAR_IMPORTS_FILE=/data/radar-review/imports.json\n"
    )
    env = dict(
        os.environ,
        PATH=f"{binary}:{os.environ['PATH']}",
        RADAR_JOB_CONFIG=str(config),
        RADAR_JOB_LOCK=str(tmp_path / "lock"),
        CONFIG_DIR=str(tmp_path),
        JOB_LOG=str(log),
        FAIL_STAGE=fail,
    )
    return env, log


# ---- Happy path ---- #


def test_job_refresh_separates_review_fetch_validate_publish_and_reports(tmp_path):
    env, log = job(tmp_path)
    result = subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True)
    assert result.returncode == 0, result.stderr
    commands = log.read_text().splitlines()
    assert len(commands) == 6
    assert "inventory --season 2026-27" in commands[0]
    assert " plan " in commands[1]
    assert " fetch " in commands[2] and "--imports /data/radar-review/imports.json" in commands[2]
    assert " validate " in commands[3]
    assert " publish " in commands[4]
    assert " report " in commands[5]
    assert all("--rm --no-deps -T radar-job" in line for line in commands)


def test_job_daily_inventory_publishes_new_coverage_without_source_fetch(tmp_path):
    env, log = job(tmp_path)
    result = subprocess.run(["bash", str(SCRIPT), "inventory"], env=env, capture_output=True)
    assert result.returncode == 0
    commands = log.read_text()
    assert " fetch " not in commands
    assert " publish " in commands


# ---- Error paths ---- #


@pytest.mark.parametrize("stage", ["inventory", "plan", "fetch", "validate"])
def test_job_failed_stage_does_not_promote_release(tmp_path, stage):
    env, log = job(tmp_path, fail=stage)
    result = subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True)
    assert result.returncode == 17
    assert " publish " not in log.read_text()


def test_job_held_host_lock_prevents_network_or_publication(tmp_path):
    env, log = job(tmp_path, lock=True)
    result = subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True)
    assert result.returncode != 0
    assert not log.exists()


# ---- Edge cases ---- #


def test_job_disabled_or_missing_config_performs_no_work(tmp_path):
    env, log = job(tmp_path, enabled=False)
    assert (
        subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True).returncode
        == 0
    )
    Path(env["RADAR_JOB_CONFIG"]).unlink()
    assert (
        subprocess.run(["bash", str(SCRIPT), "inventory"], env=env, capture_output=True).returncode
        == 0
    )
    assert not log.exists()
    assert (
        subprocess.run(["bash", str(SCRIPT), "wrong"], env=env, capture_output=True).returncode == 2
    )
