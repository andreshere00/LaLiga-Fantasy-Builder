"""Supply audit gates cannot be satisfied by reordered columns or invented approvals."""

# ---- Mocks, fixtures & helpers ---- #

import json

import pytest
from fantasy_api.radar.audits import SupplyAudit, SupplyAudits
from fantasy_api.radar.files import content_id
from fantasy_api.radar.profiles import PROFILES


def capture(profile="midfielder_v1"):
    """Synthetic private-adapter JSON, explicitly not evidence of live supply."""
    return dict(
        name="Test Player",
        club="Club",
        league="Test League",
        age=23,
        position="Test role",
        season="2026-27",
        minutes=600,
        percentiles=[0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 100.0],
        metric_labels=[label for _, label, _ in PROFILES[profile].metrics],
        fetched_at="2026-11-01T10:00:00Z",
    )


def audit(profile="midfielder_v1", **changes):
    """Synthetic reviewed fixture for testing only."""
    return SupplyAudit.model_validate(
        dict(
            audit_id=profile,
            provider="datamb",
            profile=profile,
            season="2026-27",
            source_position="Test role",
            source_labels=capture(profile)["metric_labels"],
            metric_keys=[key for key, _, _ in PROFILES[profile].metrics],
            recipe_version="test-v1",
            capture_hash=content_id(capture(profile)),
            evidence=["https://example.com/permission"],
            reviewed_at="2026-11-01T10:00:00Z",
            reviewer="Operator",
            access_approved=True,
            discovery_approved=True,
            definitions_approved=True,
        )
        | changes
    )


# ---- Happy path ---- #


@pytest.mark.parametrize("profile", PROFILES)
def test_verify_capture_seven_role_schemas_validates_zero_and_full_percentiles(tmp_path, profile):
    (tmp_path / f"{profile}.json").write_text(json.dumps(capture(profile)))
    audit(profile).verify_capture(tmp_path)


def test_report_missing_supply_profiles_stay_blocked(tmp_path):
    (tmp_path / "midfielder_v1.json").write_text(json.dumps(capture()))
    report = SupplyAudits(audits=[audit()]).report(tmp_path)
    assert report["validated_profiles"] == ["midfielder_v1"]
    assert len(report["blocked_profiles"]) == 5


# ---- Error paths ---- #


@pytest.mark.parametrize(
    "changes",
    [
        {"access_approved": False},
        {"discovery_approved": False},
        {"definitions_approved": False},
        {"metric_keys": list(reversed(audit().metric_keys))},
        {"source_labels": ["Same"] * 7},
    ],
)
def test_audit_invalid_permissions_or_mapping_rejects(changes):
    with pytest.raises(ValueError):
        audit(**changes)


def test_verify_capture_changed_capture_rejects_before_ingestion(tmp_path):
    (tmp_path / "midfielder_v1.json").write_text(json.dumps(capture() | {"season": "2025-26"}))
    with pytest.raises(ValueError, match="changed"):
        audit().verify_capture(tmp_path)


def test_audits_duplicate_id_rejects():
    with pytest.raises(ValueError, match="duplicate"):
        SupplyAudits(audits=[audit(), audit()])


# ---- Edge cases ---- #


def test_report_no_audits_never_implies_supply_approved(tmp_path):
    assert len(SupplyAudits().report(tmp_path)["blocked_profiles"]) == 6


def test_decision_multiple_roles_requires_stable_reviewed_default():
    from fantasy_api.radar.audits import RoleAssignment
    from test_radar_registry import decision

    role = RoleAssignment(
        profile="midfielder_v1",
        default=True,
        audit_id="midfielder_v1",
        evidence="https://example.com/role",
        reviewer="Operator",
        reviewed_at="2026-11-01T10:00:00Z",
    )
    assert decision(roles=[role.model_dump()]).roles[0].default
    with pytest.raises(ValueError, match="default"):
        decision(roles=[role.model_copy(update={"default": False}).model_dump()])
    with pytest.raises(ValueError, match="duplicate"):
        decision(roles=[role.model_dump(), role.model_dump()])
    with pytest.raises(ValueError, match="matched"):
        decision(status="ambiguous", roles=[role.model_dump()])


def test_main_audit_empty_manifest_reports_all_profiles_blocked(tmp_path, capsys):
    from fantasy_api.cli.radar_sync import main

    path = tmp_path / "audits.json"
    path.write_text('{"audits": []}')
    assert main(["audit", "--audits", str(path), "--captures", str(tmp_path)]) == 0
    assert len(json.loads(capsys.readouterr().out)["blocked_profiles"]) == 6
