// Simple, non-reversible-looking mask for display purposes only
// (GET /api/auth/me localEmailMasked). Not a security control.
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) {
    return email;
  }
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}
