# Design: app-navigation-shell

Revision: r1-2026-09-30 | Owner: coordinator (design-agent role) | Decision: features/app-navigation-shell/decision.json

## Input
- requirements/app-navigation-shell.md r1-2026-09-30 (sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25) — US-001..US-007, AC-001..AC-010
- architecture/app-navigation-shell.md (sha256 — xem decision.json) — route tree (`createBrowserRouter`, Data mode), `NavSidebar`/`AppShell`/`navConfig.ts`, loader `requireSession`, `HydrateFallback`, state machine điều hướng, OQ-N04 đã resolved ở kiến trúc (overlay tự đóng theo route change; logout giữa route rồi login lại luôn về `/account`)
- `design/ui-visual-refresh.md` — token màu/spacing/radius, `.app-header`/`.app-main`/`.card` composition hiện có — KHÔNG đổi token, chỉ thêm phần tử mới dùng lại đúng token này
- Code hiện có: `frontend/src/index.css`, `frontend/src/components/common/{Button,TextField,InlineMessage}.tsx`, `frontend/src/theme/ThemeToggle.tsx`

## Common component mapping
| Common component | Dùng ở |
|---|---|
| `Button` (`variant="secondary"`) | Nút toggle mở/đóng sidebar trên mobile |
| (mới) `NavSidebar` + `NavGroupHeading`/`NavItem` | Khung điều hướng — xem lý do đặt ở `components/layout/` không phải `components/common/` dưới |
| `Link`/`NavLink` (từ `react-router`) | Mọi điều hướng trong `NavSidebar` và nút "Quay về trang chính" ở `NotFoundPage` — không dùng `<a href>` thường (sẽ full reload, mất SPA state) |

**Component mới cần thêm**: `NavSidebar` (và các phần tử con `NavGroupHeading`, `NavItem` — có thể gộp chung 1 file, không bắt buộc tách). Đặt tại `frontend/src/components/layout/NavSidebar.tsx` (theo đề xuất của architecture) — đây là bố cục khung trang (layout chrome), khác bản chất với các control nhập liệu/phản hồi dùng lặp lại nhiều nơi trong `components/common/` (TextField/Button/InlineMessage). Không thêm props/interface nào vào `Button`/`TextField`/`InlineMessage` hiện có — tái dùng nguyên bản.

## Màn hình / trạng thái

### 1. `AppShell` (route cha bảo vệ — bọc `/account`, `/connections/binance`)
Cấu trúc:
```
.app-shell                         (flex row, full height, không còn width cố định)
├── NavSidebar                     (xem mục 2)
└── .app-shell-content             (flex column, flex: 1)
    ├── .app-header                (giữ nguyên: ThemeToggle + LogoutButton, thêm nút toggle sidebar ở đầu — chỉ hiện khi mobile)
    └── .app-main                  (flex: 1, KHÔNG còn center dọc/ngang như card đăng nhập — nội dung trang là
                                     danh sách/form rộng, giống cách `.dashboard` cũ đã làm, không bọc trong `.card`
                                     420px vì sẽ làm vỡ layout AccountLinkPanel/BinanceConnectionsPage hiện có)
        └── <Outlet/>              (AccountPage hoặc BinanceConnectionsPage)
```
Token mới cần thêm vào `frontend/src/index.css`: `--sidebar-width: 240px` (desktop, cố định — Hyperliquid-style sidebar không quá hẹp để đọc được label tiếng Việt dài như "Kết nối Binance"), `--sidebar-breakpoint: 768px` (giải quyết OQ-N03 — dưới ngưỡng này sidebar chuyển overlay; 768px là ngưỡng phổ biến tablet/mobile, nhất quán với cách đa số layout 2 cột chuyển 1 cột).

### 2. `NavSidebar` (US-001, US-002, US-003, AC-001, AC-004, AC-006)
**Desktop (viewport ≥ `--sidebar-breakpoint`)**: cố định bên trái, `width: var(--sidebar-width)`, `background: var(--color-surface)`, `border-right: 1px solid var(--color-border)`, không toggle được (luôn hiện) — MVP không có yêu cầu collapse-to-icon trên desktop (ngoài scope, requirement không yêu cầu).

**Mobile (viewport < `--sidebar-breakpoint`)**: ẩn mặc định (`transform: translateX(-100%)`, `transition`), nút toggle (icon "☰", `aria-label="Mở menu điều hướng"`) hiện ở `.app-header` bên trái (trước ThemeToggle). Bấm toggle → sidebar trượt vào, hiển thị `.sidebar-backdrop` (nền mờ đen, phủ `.app-main`, bấm vào backdrop cũng đóng sidebar) — pattern overlay chuẩn, giống dialog nhưng không dùng `<dialog>` (không phải modal chặn toàn bộ trang, chỉ che nội dung).

Nội dung (từ `navConfig.ts`, kiến trúc đã định nghĩa cấu trúc dữ liệu):
```
[Nhóm "Tài khoản"]
  • Tài khoản              -> /account
[Nhóm "Kết nối sàn"]
  • Kết nối Binance        -> /connections/binance
```
- Tên nhóm (`NavGroupHeading`): text nhỏ, `--font-size-sm`, `--color-text-secondary`, uppercase nhẹ (`letter-spacing` theo token hiện có, không thêm token mới), không phải link/button — chỉ là label phân nhóm.
- `NavItem`: dùng `<NavLink>` (react-router), mỗi item 1 dòng, padding `--space-sm` `--space-md`, `border-radius: var(--radius)`.
  - Mặc định: `color: var(--color-text-primary)`.
  - Active (`NavLink` tự thêm class khi khớp route — dùng `className={({isActive}) => ...}` hoặc `aria-current="page"` mặc định của `NavLink`): nền `color-mix(in srgb, var(--color-accent) 15%, var(--color-surface))`, chữ `var(--color-accent)`, viền trái 3px `var(--color-accent)` (nhất quán pattern "viền trái nhấn mạnh" đã dùng ở `InlineAlert`/`InlineStatus` của `ui-visual-refresh`, không phát minh pattern mới).
  - Hover (không active): nền `var(--color-surface)` sáng hơn nhẹ (`color-mix` với `--color-border`).
- Click 1 `NavItem` trên mobile → điều hướng + tự đóng overlay (architecture đã định: `useEffect` theo `location.pathname`).

### 3. `.app-header` (sửa, không đổi hành vi ThemeToggle/LogoutButton hiện có)
Thêm nút toggle sidebar (chỉ render khi mobile, dùng CSS `display: none` trên desktop qua media query thay vì JS, tránh flash sai) ở đầu bên trái; `ThemeToggle` + `LogoutButton` giữ nguyên vị trí bên phải như hiện tại.

### 4. `LoginPage` (US-006, AC-002, AC-007) — không đổi nội dung, chỉ đổi vị trí file
Giữ nguyên y hệt UI hiện có của `App.tsx` khi `isLoggedIn === false`: `.app-header` (chỉ `ThemeToggle`, không có nút toggle sidebar vì trang này không có sidebar), `.app-main` center, `.card` chứa `LoginForm`/`RegisterForm` + nút chuyển đổi. Không có thay đổi copy/AC — đây là di chuyển code, không phải thiết kế lại.

### 5. Trạng thái loading toàn trang (`HydrateFallback`, AC-010)
Khi `requireSession` loader chưa resolve (giống `isLoggedIn === null` hiện tại): render `.app-header` (chỉ `ThemeToggle`, giống `LoginPage`) + `.app-main` + text "Đang tải..." — **KHÔNG có `NavSidebar`**. Giữ nguyên y hệt copy/layout hiện tại của nhánh `isLoggedIn === null` trong `App.tsx` cũ, chỉ chuyển vào `HydrateFallback` của route "protected".

### 6. `NotFoundPage` (US-007, AC-008)
Render trong `.app-main` (không có `NavSidebar`, không có `.app-header` ThemeToggle/LogoutButton — route này nằm ngoài `AppShell`, độc lập, đơn giản tối đa vì không cần biết trạng thái đăng nhập):
- Heading "Không tìm thấy trang" (`<h2>`).
- Text "Trang bạn truy cập không tồn tại."
- `<Link to="/account">` dạng `Button variant="primary"` styled: "Quay về trang chính".

Lý do không hiện sidebar/header ở 404: route này không qua `requireSession`, không biết chắc user đã đăng nhập hay chưa (xem architecture — cố ý không phân biệt để tránh lộ "route tồn tại nhưng cần login" qua khác biệt hành vi). Nếu render `NavSidebar` ở đây sẽ phải tự gọi `me()` thêm một lần nữa chỉ để quyết định hiện gì — không cần thiết cho 1 trang lỗi, giữ tối giản.

### 7. Responsive — bảng tổng hợp theo breakpoint
| Viewport | Sidebar | Nút toggle |
|---|---|---|
| ≥ 768px (`--sidebar-breakpoint`) | Luôn hiện, cố định bên trái, không che nội dung | Không hiện (`display: none`) |
| < 768px | Ẩn mặc định, hiện dạng overlay khi bấm toggle, có backdrop | Hiện ở `.app-header`, trái của ThemeToggle |

Resize cửa sổ băng qua breakpoint trong khi overlay đang mở (edge case ở requirement): dùng thuần CSS media query cho layout cố định/overlay (không lưu "đang mở" dưới dạng áp dụng cứng qua JS resize listener) — nghĩa là nếu viewport vượt lên ≥768px, CSS tự chuyển sang layout desktop (sidebar luôn hiện, bỏ qua state `isOpen`) ngay cả khi state nội bộ vẫn `isOpen=true`; khi thu nhỏ lại xuống <768px, sidebar trở về đúng trạng thái ẩn mặc định vì `isOpen` không tự đặt lại true khi resize — tránh hoàn toàn tình huống "kẹt overlay che nội dung ở desktop" vì desktop layout không đọc state `isOpen`.

## Accessibility
- `NavSidebar` dùng thẻ `<nav aria-label="Điều hướng chính">`.
- Mỗi `NavGroupHeading` dùng `<h3>` (không phải `<div>` giả heading) để screen reader nhảy heading được; cỡ chữ nhỏ qua CSS, không đổi semantic.
- `NavItem` dùng `<NavLink>` (render ra `<a>` thật) — không dùng `<button onClick={navigate}>` để giữ hành vi chuẩn của link (mở tab mới bằng Ctrl/Cmd+Click, hiện URL khi hover, v.v.).
- Nút toggle sidebar: `<button aria-label="Mở menu điều hướng" aria-expanded={isOpen}>`, icon kèm text ẩn (`sr-only` nếu cần) — không icon-only thuần không có label.
- Backdrop mobile: `aria-hidden="true"` (không phải nội dung, chỉ là lớp phủ bấm để đóng), không nhận focus.
- Giữ focus-visible outline hiện có (`ui-visual-refresh.md`) cho `NavItem`/nút toggle — không xoá `outline` mặc định mà không thay bằng viền `--color-accent`.
- Contrast active state (`color-mix(--color-accent 15%, --color-surface)` làm nền, `--color-accent` làm chữ): cần frontend-agent đo thực tế khi implement (tương tự yêu cầu đã có ở `ui-visual-refresh.md`), không tự claim đạt chuẩn nếu chưa đo — nếu không đạt AA, quay lại design để chỉnh tỷ lệ `color-mix` hoặc dùng viền dày hơn thay vì chỉ dựa màu chữ.

## Financial/confirm invariants (theo AGENTS.md)
Không áp dụng — feature này không có hành động tài chính nào, chỉ điều hướng UI. Không có alert/score nào trong feature này nên không có nguy cơ auto-chain.

## Unresolved / handoff cho frontend-agent
- Không còn open question nào ảnh hưởng implementation UI của chính feature này. OQ-N03 (breakpoint) đã quyết ở đây: `768px`. OQ-N02 (placeholder roadmap) và OQ-N04 (đã resolved ở architecture) không ảnh hưởng design.
- `--sidebar-width: 240px` và `--sidebar-breakpoint: 768px` là token mới — frontend-agent thêm vào `:root` của `frontend/src/index.css` cạnh các token hiện có của `ui-visual-refresh.md`, không tạo file token riêng.
- Nếu khi implement phát hiện 240px quá hẹp/rộng cho nhãn tiếng Việt thực tế (vd nhãn dài hơn dự kiến ở tương lai), quay lại design để chỉnh — không tự đổi token mà không ghi lại, theo đúng nguyên tắc đã áp dụng ở `ui-visual-refresh.md`.

## Đề xuất trạng thái
design_status: READY — mọi màn hình/trạng thái bắt buộc theo AC-001..AC-010 (loading, active state, responsive/overlay, 404, theme) đã có spec; 1 component mới (`NavSidebar`) được định nghĩa rõ vị trí/props/style, không phát minh thêm pattern ngoài token đã có của `ui-visual-refresh.md`. OQ-N03 đã quyết (768px). Không còn open question chặn implementation.
