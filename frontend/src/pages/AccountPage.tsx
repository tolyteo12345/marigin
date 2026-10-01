import { AccountLinkPanel } from '../components/AccountLinkPanel';
import { panelClassName } from '../styles';

// Route element for "/account" — thin wrapper, content unchanged from the
// pre-navigation dashboard (requirements/app-navigation-shell.md: no change
// to AccountLinkPanel's own AC/behavior).
export function AccountPage() {
  return (
    <section className={panelClassName}>
      <AccountLinkPanel />
    </section>
  );
}
