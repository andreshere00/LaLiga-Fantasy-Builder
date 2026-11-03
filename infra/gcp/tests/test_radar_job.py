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
        'RADAR_TEAM_IDS="4 15"\n'
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


def test_job_refresh_uses_guarded_discovery_before_any_network_stage(tmp_path):
    env, log = job(tmp_path)
    result = subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True)
    assert result.returncode == 0, result.stderr
    commands = log.read_text().splitlines()
    assert len(commands) == 2
    assert " weekly " in commands[0]
    assert "--team-id 4 --team-id 15 --weekday wed" in commands[0]
    assert "--eligibility /data/radar-config/eligibility.json" in commands[0]
    assert "--observations /data/radar-config/observations.json" in commands[0]
    assert "--imports /data/radar-review/imports.json" in commands[0]
    assert " report " in commands[1]
    assert all("--rm --no-deps -T radar-job" in line for line in commands)
    assert not any(f" {stage} " in commands[0] for stage in ("inventory", "fetch", "publish"))


def test_job_refresh_without_imports_uses_datamb_adapter(tmp_path):
    env, log = job(tmp_path)
    config = Path(env["RADAR_JOB_CONFIG"])
    config.write_text(
        config.read_text().replace("RADAR_IMPORTS_FILE=/data/radar-review/imports.json\n", "")
    )
    result = subprocess.run(["bash", str(SCRIPT), "refresh"], env=env, capture_output=True)
    assert result.returncode == 0, result.stderr
    assert "--imports" not in log.read_text()


def test_job_daily_inventory_publishes_new_coverage_without_source_fetch(tmp_path):
    env, log = job(tmp_path)
    result = subprocess.run(["bash", str(SCRIPT), "inventory"], env=env, capture_output=True)
    assert result.returncode == 0
    commands = log.read_text()
    assert " fetch " not in commands
    assert " publish " in commands


# ---- Error paths ---- #


@pytest.mark.parametrize(
    ("mode", "stage"),
    [
        ("refresh", "weekly"),
        ("inventory", "inventory"),
        ("inventory", "plan"),
        ("inventory", "validate"),
    ],
)
def test_job_failed_stage_stops_host_pipeline(tmp_path, mode, stage):
    env, log = job(tmp_path, fail=stage)
    result = subprocess.run(["bash", str(SCRIPT), mode], env=env, capture_output=True)
    assert result.returncode == 17
    assert " report " not in log.read_text()
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
