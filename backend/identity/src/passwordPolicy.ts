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
  return SEQUENCES.some(sequence => sequence.includes(value) || [...sequence].reverse().join("").includes(value));
}

/** Lists reasons a new password is easy to guess; keep in sync with `frontend/src/auth/passwordPolicy.ts`. */
export function passwordIssues(password: string, personal: readonly string[] = []): string[] {
  if (!password) return [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    return [`Use at least ${PASSWORD_MIN_LENGTH} characters (${password.length} so far).`];
  }
  const lowered = password.toLowerCase();
  const issues: string[] = [];
  if (COMMON_PASSWORDS.includes(lowered.replace(/[^a-z]/g, "")) || COMMON_PASSWORDS.includes(lowered)) {
    issues.push("Avoid common passwords, even with digits added.");
  }
  if (isRepeatedOrSequential(lowered)) issues.push("Avoid repeated or sequential characters.");
  const terms = personal.map(item => (item.split("@")[0] ?? "").trim().toLowerCase()).filter(item => item.length >= 3);
  if (terms.some(term => lowered.includes(term))) issues.push("Do not include your username or email.");
  return issues;
}
