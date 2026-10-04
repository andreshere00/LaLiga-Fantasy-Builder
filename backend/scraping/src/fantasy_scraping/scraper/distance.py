"""String distances used by the route resolver."""


def padded_hamming(a: str, b: str) -> int:
    """Count mismatched positions, treating the length gap as mismatches.

    Args:
        a: First string.
        b: Second string.

    Returns:
        The padded Hamming distance.
    """
    return sum(x != y for x, y in zip(a, b, strict=False)) + abs(len(a) - len(b))


def banded_levenshtein(a: str, b: str, limit: int) -> int | None:
    """Compute Levenshtein distance with an early exit.

    Args:
        a: First string.
        b: Second string.
        limit: Largest distance of interest.

    Returns:
        The distance, or None when it exceeds ``limit``.
    """
    if abs(len(a) - len(b)) > limit:
        return None
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (ca != cb)))
        if min(row) > limit:
            return None
        previous = row
    return previous[-1] if previous[-1] <= limit else None
