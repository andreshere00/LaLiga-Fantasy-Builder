export const PASSWORD_MIN_LENGTH = 12;
const COMMON_PASSWORDS: readonly string[] = [
  "password", "123456", "12345678", "qwerty", "letmein", "welcome", "admin", "iloveyou",
  "football", "fantasy", "laliga", "barcelona", "realmadrid", "atletico", "abc123",
];
const SEQUENCES: readonly string[] = [
  "abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiopasdfghjklzxcvbnm",
];

function isRepeatedOrSequential(value: string): boolean {
  if (new Set(value).size <= 2) return true;
  return SEQUENCES.some(sequence => {
    const reversed = [...sequence].reverse().join("");
    return sequence.includes(value) || reversed.includes(value);
  });
}

/**
 * Lists reasons a new password is easy to guess.
 *
 * Length is checked first; the other rules only run once it is long enough so the
 * person sees one actionable problem at a time.
 *
 * Args:
 *   password: Candidate password exactly as typed.
 *   personal: Account details (username, email) the password must not contain.
 *
 * Returns:
 *   Human-readable problems; empty when the password passes every rule.
 */
export function passwordIssues(password: string, personal: readonly string[] = []): string[] {
  if (!password) return [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    return [`Use at least ${PASSWORD_MIN_LENGTH} characters (${password.length} so far).`];
  }
  const lowered = password.toLowerCase();
  const issues: string[] = [];
  const letters = lowered.replace(/[^a-z]/g, "");
  if (COMMON_PASSWORDS.includes(letters) || COMMON_PASSWORDS.includes(lowered)) {
    issues.push("Avoid common passwords, even with digits added.");
  }
  if (isRepeatedOrSequential(lowered)) issues.push("Avoid repeated or sequential characters.");
  const terms = personal.map(item => item.split("@")[0].trim().toLowerCase())
    .filter(item => item.length >= 3);
  if (terms.some(term => lowered.includes(term))) {
    issues.push("Do not include your username or email.");
  }
  return issues;
}
