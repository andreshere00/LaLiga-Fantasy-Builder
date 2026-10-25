"""Interactive application login and optional native LaLiga connection."""

from fantasy_auth.cli.browser_session import main as browser_main


def main(argv: list[str] | None = None) -> int:
    """Use the running stack's Better Auth browser flow; preserve read-only flags."""
    return browser_main(argv)
