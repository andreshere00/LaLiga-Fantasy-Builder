"""Keep infra/config-schema.json aligned with the dotenv templates it describes."""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = ROOT / "infra" / "config-schema.json"
EXAMPLES = ROOT / "infra" / "gcp" / "examples"
KEY = re.compile(r"^#?\s*([A-Z][A-Z0-9_]*)=")
SECRET_NAME = re.compile(r"(PASSWORD|_TOKEN|_SECRET|_KEY|_KEY_BASE64)$")

# ---- Mocks, fixtures & helpers ---- #


def _load() -> dict:
    """Parse the schema file."""
    return json.loads(SCHEMA.read_text())


def _keys(path: Path) -> set[str]:
    """Return KEY names declared (or commented-out) in a dotenv template."""
    return {m.group(1) for line in path.read_text().splitlines() if (m := KEY.match(line))}


class ConfigSchemaTests(unittest.TestCase):
    """Verify the schema locates every secret the repository templates declare."""

    # ---- Happy path ---- #

    def test_secrets_production_payload_exists_in_example_file(self) -> None:
        for entry in _load()["secrets"]:
            payload = entry["production"]["payload"]
            with self.subTest(secret=entry["name"]):
                self.assertIn(entry["name"], _keys(EXAMPLES / f"{payload}.env.example"))

    def test_secrets_local_files_exist_and_declare_the_key(self) -> None:
        for entry in _load()["secrets"]:
            for rel in entry["local"]:
                template = ROOT / (".env.template" if rel == ".env" else f"{rel}.example")
                with self.subTest(secret=entry["name"], file=rel):
                    self.assertIn(entry["name"], _keys(template))

    def test_example_secret_like_keys_are_all_listed(self) -> None:
        listed = {entry["name"] for entry in _load()["secrets"]}
        for path in EXAMPLES.glob("*.env.example"):
            for key in _keys(path):
                if SECRET_NAME.search(key):
                    with self.subTest(key=key, file=path.name):
                        self.assertIn(key, listed)

    # ---- Error paths ---- #

    def test_schema_never_contains_secret_looking_values(self) -> None:
        text = SCHEMA.read_text()
        self.assertIsNone(re.search(r"\bre_[A-Za-z0-9]{16,}", text))

    # ---- Edge cases ---- #

    def test_secret_names_are_unique(self) -> None:
        names = [entry["name"] for entry in _load()["secrets"]]
        self.assertEqual(len(names), len(set(names)))


if __name__ == "__main__":
    unittest.main()
