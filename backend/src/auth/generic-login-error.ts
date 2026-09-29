// BR-010 / AC-004: the login failure message must never differ between
// "unknown email", "wrong password" and "account locked" — otherwise an
// attacker could enumerate valid emails or detect lockout state.
export const GENERIC_LOGIN_ERROR_MESSAGE = 'email hoặc password không đúng';
