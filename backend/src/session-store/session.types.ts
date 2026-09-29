import 'express-session';

// Augment express-session's SessionData with the fields this feature stores.
// loginAt is required to enforce the absolute 30-day cap (BR-011) since
// express-session only supports a rolling maxAge natively.
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    loginAt?: number; // epoch ms, set at the moment of successful authentication
    csrfToken?: string; // used by csrf-sync (Synchronizer Token Pattern)
  }
}
