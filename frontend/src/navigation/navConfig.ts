import type { ComponentType, SVGProps } from 'react';
import { AccountIcon, ConnectionIcon, LedgerIcon } from './icons';

// Single source of truth for sidebar groups/items (BR-002: originally the 2
// groups matching DONE features at MVP; adding a module only touches this
// file — see architecture/app-navigation-shell.md "UI handoff"). The
// capital-provenance-ledger group was added the same way.
export interface NavItem {
  path: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'account', label: 'Tài khoản', items: [{ path: '/account', label: 'Tài khoản', icon: AccountIcon }] },
  {
    id: 'binance',
    label: 'Kết nối sàn',
    items: [{ path: '/connections/binance', label: 'Kết nối Binance', icon: ConnectionIcon }],
  },
  {
    id: 'ledger',
    label: 'Nguồn vốn',
    items: [{ path: '/ledger', label: 'Sổ theo dõi nguồn vốn', icon: LedgerIcon }],
  },
];
