# Implementation: app-navigation-shell

Owner: coordinator (frontend-agent role) | Architecture revision: sha256:6ab64ae1c92a5e28b7a0c60ab863a7c7ee7b11ed6f46e7ab22e629fe91a020bf
Design revision: sha256:d2a66dea812c7363fde3694a282f154f75fa485b24a0eee07d34cba43cf5b14c
Requirement revision: sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25
Decision: features/app-navigation-shell/decision.json

## Trạng thái tổng quan
Implementation **READY**. Feature này thuần frontend (không có thay đổi backend/DB, đúng dự kiến ở architecture). `tsc -b` sạch, `vite build` thành công, `oxlint` không phát sinh warning mới (2 warning còn lại trong `AccountLinkPanel.tsx`/`BinanceConnectionsPage.tsx` đã tồn tại từ trước, không thuộc phạm vi thay đổi của feature này). 25/25 test frontend pass (18 test cũ không đổi + 7 test mới cho routing, gồm 1 test bổ sung trong vòng code review cho AC-006 JS wiring — xem features/app-navigation-shell/review.md).

## Thay đổi so với architecture (đã ghi lại, không âm thầm lệch)
- **Tách `LoadingShell` ra file riêng** (`router/LoadingShell.tsx`) thay vì định nghĩa inline trong `router/routes.tsx` như sketch của architecture — lý do thuần kỹ thuật: `routes.tsx` export cả `routeConfig`/`router` (không phải component) lẫn 1 component sẽ khiến oxlint cảnh báo `react(only-export-components)` (fast-refresh). Không đổi hành vi/behavior, chỉ đổi vị trí file.
- **Export thêm `routeConfig` (mảng `RouteObject[]`)** từ `router/routes.tsx` bên cạnh `router` (instance `createBrowserRouter`) — để test dùng `createMemoryRouter(routeConfig, ...)` build từ đúng route tree thật thay vì khai báo lại (đúng tinh thần COND-N02, không phải thay đổi kiến trúc).
- **Breakpoint 768px hardcode trong CSS `@media`** thay vì đọc token `--sidebar-breakpoint` — CSS media query không đọc được custom property. Giá trị vẫn đúng 768px như design đã chốt (OQ-N03), chỉ không tồn tại dưới dạng 1 CSS variable thực sự dùng được ở `@media`; ghi chú rõ trong code (`index.css`) để không ai tưởng nhầm có token đó.
- **Dọn orphan do chính thay đổi này tạo ra**: xoá class CSS `.dashboard` và `.panel + .panel` (`frontend/src/index.css`) — chỉ được dùng bởi `App.tsx` cũ (nay đã xoá hoàn toàn), không còn nơi nào tham chiếu.

## Cấu trúc mới (`frontend/src/`)
- `navigation/navConfig.ts`: `NAV_GROUPS` — nguồn dữ liệu duy nhất cho sidebar (2 nhóm, mỗi nhóm 1 mục, đúng BR-002).
- `router/requireSession.ts`: loader gọi `me()` (API đã có từ `user-authentication`, không đổi), `redirect('/login')` nếu lỗi.
- `router/routes.tsx` + `router/LoadingShell.tsx`: route tree `createBrowserRouter` (Data mode) đúng theo architecture — `/login`, layout route `protected` (loader `requireSession`, `HydrateFallback`, element `AppShell`) với con `account`/`connections/binance`, và catch-all `*` → `NotFoundPage`.
- `components/layout/AppShell.tsx`: header (nút toggle sidebar mobile + `ThemeToggle` + `LogoutButton`, giữ nguyên hành vi 2 cái sau) + `NavSidebar` + `<Outlet/>`.
- `components/layout/NavSidebar.tsx`: render nhóm/mục từ `navConfig`, active state qua `NavLink`, overlay mobile tự đóng theo `location.pathname` (giải quyết OQ-N04a).
- `pages/AccountPage.tsx`, `pages/LoginPage.tsx` (di chuyển nguyên vẹn từ `App.tsx` cũ, không đổi copy/logic), `pages/NotFoundPage.tsx` (mới, AC-008).
- `App.tsx`/`App.test.tsx` **xoá hoàn toàn** — toàn bộ logic if/else chuyển sang route tree.
- `main.tsx`: dùng `<RouterProvider router={router}/>` thay `<App/>`.
- `index.css`: thêm `--sidebar-width`, các rule `.app-shell`/`.nav-sidebar`/`.nav-item`/`.nav-toggle-btn`/`.nav-sidebar-backdrop` + `@media (max-width: 768px)` cho overlay mobile; `.app-main-shell > *` cap width 960px (giữ đúng bề rộng như `.dashboard` cũ).

## Dependency mới
`react-router@8.4.0` (gói duy nhất, không có `react-router-dom` theo EV-001 của BA). Cài qua `npm install react-router@^8`.

## Test evidence
- `router/routes.test.tsx` (6 test mới, dùng `createMemoryRouter(routeConfig, ...)` — đúng route tree thật, không khai báo lại):
  - AC-001/AC-004: sidebar hiện đúng 2 nhóm, active state đúng mục đang xem (`aria-current="page"`).
  - AC-003: click nav item khác → nội dung + active state đổi đúng.
  - AC-005: deep-link thẳng `/connections/binance` (không qua `/account` trước) → đúng trang.
  - AC-002/AC-007: session 401 → redirect `/login`, không có bất kỳ nội dung protected nào từng xuất hiện trong DOM.
  - AC-008: route lạ → `NotFoundPage`, link quay về `/account`.
  - AC-010: `me()` cố ý delay 50ms → `HydrateFallback` ("Đang tải...") hiện, không có `NavSidebar`, tới khi loader resolve mới chuyển.
  - AC-006 (JS wiring, thêm trong code review): bấm nút toggle → `aria-expanded`/class `nav-sidebar-open` bật đúng; chọn 1 mục nav trong lúc overlay mở → tự đóng lại (OQ-N04a). Phần CSS `@media` thật (ẩn/hiện theo viewport) không test được trong jsdom — xem "Hạn chế môi trường".
- 18 test cũ (auth/binance components) không đổi, vẫn pass nguyên — xác nhận không có regression ở nội dung `AccountLinkPanel`/`BinanceConnectionsPage`.
- `npx tsc -b`: sạch. `npm run lint` (oxlint): không có warning mới. `npm run build`: thành công (`vite build`, 208ms).
- Verify thủ công bằng `vite preview` + `curl`: `GET /connections/binance` trên server tĩnh đã build trả `200` + đúng `index.html` (xác nhận SPA fallback hoạt động ở preview server — ghi chú vận hành COND-N03 vẫn cần cấu hình tương đương ở host production thật, không thuộc DONE của feature này).
- Backend test suite (`npm test` ở `backend/`) chạy lại để xác nhận không ảnh hưởng: 69/69 pass — đúng dự kiến vì feature này không đổi code backend.

## Hạn chế môi trường (không phải việc bỏ sót)
Không có browser tool thật trong môi trường này để click-through UI thật (mở app, bấm toggle sidebar trên viewport mobile thật, kiểm tra bằng mắt contrast/theme) — đã verify tối đa có thể bằng Testing Library (DOM thật qua jsdom, bao gồm cả `aria-current`/role) + `vite preview`/`curl` cho build thật. AC-009 (theme áp đúng token lên sidebar) chưa có evidence đo contrast thật — cần người có browser thật verify trước QA DONE, giống cách `ui-visual-refresh`/`binance-read-only-connection` đã từng ghi nhận hạn chế tương tự.

## Cập nhật 2026-10-01: migrate sang Tailwind + style near.com (design rev r2)
Theo yêu cầu user follow near.com UI (xem `design/ui-visual-refresh.md` rev 3 cho bối cảnh đầy đủ Tailwind migration áp dụng toàn app). Phần ảnh hưởng feature này (`design/app-navigation-shell.md` rev r2 — chỉ style, không đổi route/API/cấu trúc nhóm):
- `NavSidebar.tsx`: active state đổi từ "viền trái + tint accent" (class `.nav-item-active` cũ) sang pill nền `--color-border` trung tính (khớp near.com — ảnh tham chiếu dùng highlight xám cho mục đang chọn, accent dành riêng cho tín hiệu khác). Thêm icon SVG inline (`navigation/icons.tsx`, mới) cho mỗi `NavItem`. Breakpoint giữ nguyên 768px nhưng cơ chế đổi từ `@media (max-width:768px)` thủ công sang Tailwind `md:` (mặc định đúng 768px, không lệch hành vi).
- Thay class `nav-sidebar-open` cũ bằng attribute `data-open` trên `<nav>` — test hook ổn định hơn, không phụ thuộc tên class CSS. Cập nhật `routes.test.tsx`: 2 assertion đổi từ `nav.className.toContain(...)` sang `toHaveAttribute('data-open', ...)`, không đổi ý nghĩa test.
- `AppShell.tsx`: thay toàn bộ class CSS cũ (`.app-shell`, `.app-header`, `.nav-toggle-btn`...) bằng Tailwind utility, hành vi/cấu trúc DOM giữ nguyên.
- `AccountPage.tsx`/route Binance trong `routes.tsx`: dùng `panelClassName` dùng chung (`frontend/src/styles.ts`, mới) thay cho class `.panel` cũ.

Verify: `npx tsc -b` sạch, `npx vitest run` 25/25 pass (bao gồm toàn bộ 7 test của `routes.test.tsx`, không giảm), `npm run build` thành công, `npm run lint` không warning mới. Đọc CSS output xác nhận `md:translate-x-0`, `data-open` (qua React, không phải CSS, không cần kiểm trong CSS output) và các class khác compile đúng.

**Giới hạn môi trường (không đổi)**: không có browser tool thật — WARN-N01 hiện có (AC-006 CSS thật, AC-009 contrast thật) mở rộng thêm phạm vi "so khớp near.com" cho sidebar (icon/active-state/spacing), cùng lý do thiếu công cụ, không phải lỗi mới.

## Đề xuất trạng thái (cập nhật)
implementation_status: READY (revision mới — xem decision.json).
