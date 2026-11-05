"""Replace only the five image assignments in a private runtime dotenv file."""

import os
import re
import sys
from pathlib import Path

SERVICES = ("identity", "auth", "api", "scraping", "frontend")


def merge(runtime: Path, manifest: Path, registry: str, output: Path) -> None:
    """Validate a complete release and preserve all non-image configuration bytes."""
    if not re.fullmatch(r"[a-z0-9-]+-docker\.pkg\.dev/[a-z][a-z0-9-]+/[a-z][a-z0-9_-]*", registry):
        raise ValueError("Invalid Artifact Registry repository.")
    expected = {f"{service.upper()}_IMAGE": service for service in SERVICES}
    replacements = {}
    for line in manifest.read_text().splitlines():
        name, separator, reference = line.partition("=")
        if not separator or name not in expected or name in replacements:
            raise ValueError("Release manifest has unexpected or duplicate entries.")
        if not re.fullmatch(
            re.escape(f"{registry}/{expected[name]}@sha256:") + r"[a-f0-9]{64}", reference
        ):
            raise ValueError("Release manifest contains an invalid image reference.")
        replacements[name] = reference
    if replacements.keys() != expected.keys():
        raise ValueError("Release manifest must contain all five images.")

    # Work with bytes so passwords, CRLFs, comments and quoting are preserved exactly.
    result = []
    seen = set()
    for line in runtime.read_bytes().splitlines(keepends=True):
        match = re.match(rb"\s*(?:export\s+)?([A-Z_]+)\s*=", line)
        name = match[1].decode() if match else ""
        if name in replacements:
            if name in seen:
                raise ValueError("Runtime configuration contains duplicate image entries.")
            seen.add(name)
            ending = b"\r\n" if line.endswith(b"\r\n") else b"\n"
            result.append(f"{name}={replacements[name]}".encode() + ending)
        else:
            result.append(line)
    if seen != expected.keys():
        raise ValueError("Runtime configuration must already contain all five image entries.")
    with output.open("xb") as target:
        os.chmod(output, 0o600)
        target.write(b"".join(result))


if __name__ == "__main__":
    try:
        merge(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]))
    except (ValueError, OSError):
        # Do not include source lines or payloads in CI errors.
        sys.exit("Unable to prepare runtime configuration; check manifest and image assignments.")
