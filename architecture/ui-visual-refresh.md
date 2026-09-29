# Architecture: ui-visual-refresh

Owner: architect-agent | Requirement revision: 2 | BA revision: 1
Decision: features/ui-visual-refresh/decision.json

## Gate check và scope
BA_FEASIBILITY: APPROVED, không blocker/condition. Scope xác nhận thuần visual/CSS-layer: design tokens (dark mặc định + light), áp dụng lại styling cho 5 màn hình/component hiện có (`LoginForm`, `RegisterForm`, `LogoutButton`, `TelegramLoginButton`, `AccountLinkPanel`) và common component library (`Button`, `TextField`, `InlineAlert`/`InlineStatus`), cộng thêm theme toggle + persistence (US-004, AC-005, AC-006). Không đổi business logic, API, auth flow, DB. Không có business policy nào cần chốt ở tầng kiến trúc — chỉ có một quyết định kỹ thuật thuần (nơi đặt theme state), không phải policy nghiệp vụ.

## Components và dependency contracts
Thêm mới, không sửa cấu trúc hiện có:
- `frontend/src/theme/ThemeProvider.tsx`: React Context cung cấp `{ theme: 'dark' | 'light', setTheme, toggleTheme }`. Không dùng thư viện ngoài (Zustand/Redux...) — state cục bộ đủ, đúng thang ưu tiên "đơn giản trước" của AGENTS.md/coding-principles, feature không có state nào khác cần chia sẻ ngoài theme.
- `frontend/src/theme/ThemeToggle.tsx`: component UI nhỏ (dùng `Button` common, `variant="secondary"`) gọi `toggleTheme()`. Đặt ở `App.tsx` shell, luôn visible bất kể đăng nhập hay chưa (theme là preference thiết bị, không gắn với business state).
- Không thêm dependency npm mới. Không đổi `frontend/src/api/*` (theme không gọi backend).

Boundary: theme layer hoàn toàn tách biệt khỏi auth/account-link logic hiện có — `ThemeProvider` bọc ngoài `App` trong `main.tsx`, không chèn vào giữa cây component nghiệp vụ, không nhận props từ auth state.

## Domain / storage / ledger
Không áp dụng — không có entity, không có DB schema mới/sửa/xóa. `docs/DATABASE.md` không cần cập nhật (xác nhận: feature này không chạm bảng/cột/enum nào).

Lưu trữ duy nhất: `localStorage` key `mtl-theme` (giá trị `'dark' | 'light'`), client-side, không phải secret, không audit. Đọc giá trị này đồng bộ (synchronous) khi khởi tạo `ThemeProvider` (state initializer, không dùng `useEffect` để tránh flash-of-wrong-theme khi reload).

## API contracts và state machines
Không áp dụng — không có API endpoint mới/sửa. Không có network call nào trong theme flow. State machine duy nhất là 2 giá trị `dark`/`light` chuyển đổi qua `toggleTheme()`, không có trạng thái loading/error (đọc localStorage là synchronous, không throw trong flow bình thường; nếu `localStorage` không khả dụng — vd. private mode chặn — fallback về default `'dark'` theo BR-003, không crash app).

## Financial formulas
Không áp dụng.

## Concurrency / idempotency
Không áp dụng — không có write nào tới backend/ledger. Toggle theme nhiều lần liên tiếp chỉ ghi đè `localStorage` value cuối cùng, không có race điều kiện đáng kể (single-tab write; multi-tab desync là chấp nhận được, không phải financial risk — không cần đồng bộ qua `storage` event trong MVP này).

## User confirmation / modes / security / audit
Không áp dụng — theme không phải financial action, không cần confirm, không audit log, không liên quan READ_ONLY/PAPER_TRADING/LIVE mode (feature hiện tại của app chưa có khái niệm mode ở UI, đúng như out-of-scope đã ghi ở requirement).

## UI handoff
Cho design-agent:
- `ThemeProvider` expose `theme` hiện tại để mọi component đọc được nếu cần logic điều kiện theo theme (không nên cần, vì styling nên hoàn toàn qua CSS variables + `data-theme` attribute trên `document.documentElement`, không qua JS branching trong component).
- `ThemeToggle` cần vị trí cố định trong layout (đề xuất: góc trên app shell, cạnh `LogoutButton`) — design-agent quyết định vị trí chính xác và icon/label.
- Token cụ thể (palette hex, font, spacing) là quyết định của design-agent (OQ-002 từ requirement), kiến trúc chỉ định cơ chế: CSS custom properties định nghĩa ở `:root` (giá trị dark, vì dark là default) và override trong selector `[data-theme='light']` — đặt trong `frontend/src/index.css`, không tạo file CSS-in-JS hay thư viện theming mới.

## Validation và rollout
- AC-001..004 → không cần thay đổi component code ngoài class/CSS, verify bằng: chạy lại toàn bộ test suite hiện có (unit/integration) không sửa assertion nào — nếu có test nào fail vì đổi CSS, đó là dấu hiệu test đang sai (coupling vào style thay vì role/behavior), backend/frontend-agent phải báo lại, không tự sửa test để pass.
- AC-005/AC-006 → test mới cho `ThemeProvider`: toggle đổi `data-theme` attribute đúng, `localStorage` được ghi/đọc đúng key, default fallback khi `localStorage` trống hoặc không khả dụng.
- Không có feature flag cần thiết — thay đổi CSS/theme không có rủi ro rollback cao; nếu cần revert, revert commit là đủ (không cần kill switch runtime).
- Không ảnh hưởng deployment/CI ngoài chạy lại test suite frontend.

## Open decisions và readiness
Không còn blocker. Quyết định kỹ thuật (React Context nội bộ, không thư viện ngoài; CSS variables + `data-theme`; `localStorage` persistence) đã đủ cụ thể để design-agent và frontend-agent triển khai. Đề xuất `architecture_status: READY`.
