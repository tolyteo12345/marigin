import { redirect } from 'react-router';
import { me } from '../api/authClient';
import type { MeResponse } from '../api/types';

// Loader for the protected layout route (architecture/app-navigation-shell.md
// "API contracts và state machines"). Runs before the route renders, so a
// missing/invalid session redirects without ever mounting AppShell/NavSidebar
// (AC-007: no flash of protected content).
export async function requireSession(): Promise<MeResponse> {
  try {
    return await me();
  } catch {
    throw redirect('/login');
  }
}
