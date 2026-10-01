// Single source of truth for sidebar groups/items (BR-002: exactly the 2
// groups matching DONE features at MVP; adding a future module only touches
// this file — see architecture/app-navigation-shell.md "UI handoff").
export interface NavItem {
  path: string;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'account', label: 'Tài khoản', items: [{ path: '/account', label: 'Tài khoản' }] },
  { id: 'binance', label: 'Kết nối sàn', items: [{ path: '/connections/binance', label: 'Kết nối Binance' }] },
];
