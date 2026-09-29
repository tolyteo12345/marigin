// Technical thresholds decided by architecture/user-authentication.md.
// These are engineering defaults (not business policy owned by product/user),
// see "Telegram code expiry" note in the Concurrency section of the architecture doc.

export const TELEGRAM_CODE_TTL_SECONDS = 300;

// BR-011 resolved: rolling 7 days, absolute cap 30 days.
export const SESSION_ROLLING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_CAP_MS = 30 * 24 * 60 * 60 * 1000;

// COND-A03 resolved: argon2id params (memory in KiB, argon2 lib expects KiB).
export const ARGON2ID_OPTIONS = {
  memoryCost: 64 * 1024, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};
