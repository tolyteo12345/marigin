# QA: app-navigation-shell

Owner: coordinator (qa-agent role) | Reviewed revision: sha256:cfaa1f5409a5df1dd60fe3cca17d13041ce74a46025a76098583d6c649c67151 (review APPROVED tại `features/app-navigation-shell/review.md` sha256:fe2f2cca731dfe96d426d692cd3b4642916e0dbb58fdd7f3e2244fe89d743801)
Requirement: sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25 | Architecture: sha256:6ab64ae1c92a5e28b7a0c60ab863a7c7ee7b11ed6f46e7ab22e629fe91a020bf | Design: sha256:d2a66dea812c7363fde3694a282f154f75fa485b24a0eee07d34cba43cf5b14c
Decision: features/app-navigation-shell/decision.json
Environment/mode: READ_ONLY (feature không có financial action); frontend unit/integration test (jsdom) + 1 lần verify thật qua backend dev thật (Postgres container `margin-trading-auth-postgres` đang chạy, không phải mock) | Run time: 2026-10-01 08:30–08:40 UTC
Status: PASS_WITH_WARNINGS

## Bằng chứng đã tự chạy lại (không chỉ tin review.md)
```
cd frontend && npx tsc -b                    # sạch
cd frontend && npm run lint                  # 2 warning tiền tồn tại (AccountLinkPanel.tsx, BinanceConnectionsPage.tsx), không mới
cd frontend && npx vitest run
Test Files  6 passed (6)
Tests  25 passed (25)
cd frontend && npm run build                 # vite build thành công
cd backend && npm test
Test Suites: 8 passed, 8 total
Tests: 69 passed, 69 total                   # xác nhận feature này không đụng backend, không regression
```

**Verify thật bổ sung (không có trong review.md)** — gọi trực tiếp backend dev thật đang chạy (`localhost:3000`, Postgres container thật, không phải mock fetch của unit test) để xác nhận đúng contract mà `requireSession` loader phụ thuộc:
```
GET  /api/auth/csrf-token                        -> 200 {csrfToken: ...}
POST /api/auth/register (kèm CSRF, email test)   -> 200 {ok:true}
GET  /api/auth/me  (kèm session cookie)          -> 200 {userId:..., hasLocalCredential:true, ...}
GET  /api/auth/me  (KHÔNG kèm cookie)             -> 401 {message:"Unauthorized"}
```
Xác nhận: contract `GET /api/auth/me` → 200 khi có session hợp lệ / 401 khi không có, đúng y hệt giả định trong `router/requireSession.ts` và trong mock của `routes.test.tsx` — không chỉ tin vào mock, đã đối chiếu với backend thật đang chạy. (User chịu trách nhiệm dữ liệu test tạo ra trong Postgres dev local của chính họ — không phải production, không phải Binance, an toàn.)

## Đối chiếu Acceptance Criteria
| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC-001 | PASS | `routes.test.tsx`: sidebar hiện đúng 2 nhóm/2 mục khi có session |
| AC-002 | PASS | `routes.test.tsx` + verify thật: `me()` 401 → redirect `/login`, không có nội dung protected nào từng render |
| AC-003 | PASS | `routes.test.tsx`: click nav khác → nội dung + active state đổi đúng |
| AC-004 | PASS | `aria-current="page"` đúng mục đang xem (test AC-001/003) |
| AC-005 | PASS | `routes.test.tsx`: deep-link thẳng `/connections/binance` không qua `/account` trước |
| AC-006 | PASS (JS wiring) / NOT_RUN (CSS `@media` thật) | Test "toggles the mobile sidebar overlay..." xác nhận `aria-expanded`/class đúng + tự đóng khi chọn nav. Phần hiển thị overlay thật theo viewport (CSS `@media (max-width:768px)`) KHÔNG kiểm được — jsdom không evaluate layout/media query thật, không có browser tool trong môi trường này |
| AC-007 | PASS | Cùng evidence AC-002 — không có khung hình nào render nội dung bảo vệ trước redirect |
| AC-008 | PASS | `routes.test.tsx`: route lạ → `NotFoundPage`, link `href="/account"` |
| AC-009 | NOT_RUN | Cần đo contrast thật bằng browser (đổi theme, kiểm tra màu `NavSidebar`/active state) — không có công cụ trình duyệt trong môi trường này. Đọc code xác nhận không có màu hex cứng mới (chỉ dùng token `--color-*`/`--color-accent` kế thừa từ `ui-visual-refresh`), nhưng đọc code không thay thế đo thật |
| AC-010 | PASS | `routes.test.tsx`: `me()` delay 50ms → "Đang tải..." hiện không có sidebar, tới khi loader resolve mới chuyển |

## Required suites (theo template qa/TEMPLATE.md)
- Calculation/rounding, cap/2× boundary, reserved proceeds, PnL: **N/A** — feature không có financial logic.
- Confirmation absence/expiry/replay: **N/A** — không có financial action, chỉ điều hướng UI.
- READ_ONLY/PAPER/LIVE isolation: **N/A** — không áp dụng khái niệm mode cho feature này (kế thừa đúng nhận định requirement).
- Source mixing / provenance: **N/A**.
- Stale data / freshness: **N/A** — không có dữ liệu thị trường nào trong feature này.
- Timeout: PASS — `HydrateFallback` xử lý đúng khoảng chờ loader (AC-010); timeout thật của `me()` (network treo) không test riêng nhưng dùng chung cơ chế promise-reject → catch → redirect, không có code path khác.
- Duplicates: **N/A** — không có write operation nào trong feature này.
- Races: PASS (1 case) — resize qua breakpoint giữa lúc overlay mở được giải quyết bằng CSS thuần (không đọc state JS cho layout desktop) theo thiết kế, đã đọc lại code xác nhận đúng cơ chế (xem review.md) nhưng KHÔNG test được bằng automated test (cần resize viewport thật). Không đánh giá là NOT_RUN nghiêm trọng vì cơ chế là CSS declarative, rủi ro residual thấp (giống nhận định logic tương tự ở các QA trước cho case dùng tính năng nền tảng chuẩn).
- Reconciliation/crash recovery: **N/A** — không có state nào cần reconcile (route guard chạy lại mỗi lần điều hướng, không có cache cần phục hồi).

## Defects / warnings
Không phát hiện defect mới trong QA. 2 điểm đã ghi nhận từ trước (WARN-N01 ở decision.json, không lặp lại chi tiết ở đây):
- AC-006 (CSS `@media` thật) và AC-009 (contrast thật) chưa có evidence bằng browser thật — NOT_RUN, không phải FAIL. Cần user hoặc môi trường có browser xác nhận trước DONE.

## Kết luận
Toàn bộ test tự động pass (25 frontend + 69 backend không bị ảnh hưởng), cộng 1 lần verify thật end-to-end với backend dev thật (không chỉ mock) xác nhận đúng contract session mà route guard phụ thuộc. Không phát hiện correctness/security issue nào. 2 case NOT_RUN (AC-006 CSS thật, AC-009 contrast thật) đều do thiếu công cụ trình duyệt trong môi trường này, không phải lỗi code hay thiếu sót có thể tự đóng — nhất quán với hạn chế đã từng gặp ở `ui-visual-refresh`/`binance-read-only-connection`.

**Đề xuất qa_status: PASS_WITH_WARNINGS** — không chặn PASS vì mọi AC khác đã có bằng chứng tự động đầy đủ và phần JS của AC-006 cũng đã PASS; nhưng chặn DONE cho tới khi user/QA có browser thật xác nhận AC-006 (overlay mobile hiển thị đúng theo viewport) và AC-009 (contrast theme đạt chuẩn AA).

## Cập nhật 2026-10-01 (Tailwind migration + near.com style)
Chạy lại evidence: `tsc -b` sạch, 25/25 test pass, build thành công, lint không warning mới. Đối chiếu AC-001..010: không AC nào đổi hành vi (chỉ style/icon), giữ nguyên kết luận PASS của lần QA trước cho từng AC. WARN-N01 (AC-006 CSS thật, AC-009 contrast thật) mở rộng phạm vi sang xác nhận so khớp near.com (icon/active-state/spacing sidebar) — cùng nguyên nhân thiếu browser tool, không phải gap mới phát sinh từ thay đổi lần này.

**qa_status: PASS_WITH_WARNINGS** (không đổi). WARN-N01 vẫn là điều kiện duy nhất chặn DONE.

## Cập nhật 2026-10-01 — verify bằng browser thật
Môi trường QA lần này có công cụ browser thật (Playwright 1.x + Chromium, cài ad-hoc trong 1 npm project riêng ngoài repo, KHÔNG thêm vào `frontend/package.json` để không đổi dependency sản phẩm). Dùng để chạy 3 case NOT_RUN còn lại của WARN-N01.

**Môi trường thật đang chạy** (không khởi động lại, tránh xung đột với phiên khác đang dùng cùng port): backend `localhost:3000` (NestJS, kết nối Postgres container `margin-trading-auth-postgres` thật) + frontend `localhost:5173` (vite dev), cả hai chạy từ main checkout cùng commit với HEAD của nhánh QA này (`cbd7d72`) nên phản ánh đúng code đã qua review/QA trước đó. Tạo 1 user thật qua `POST /api/auth/register` (CSRF token lấy qua `GET /api/auth/csrf-token`), đăng nhập qua UI thật (`LoginForm`) để lấy session cookie hợp lệ, cho phép Playwright xem được `NavSidebar` (route bảo vệ).

Script verify (ad-hoc, không phải sản phẩm, giữ lại để tái dùng): `.qa-scripts/app-navigation-shell-browser-verify.js`.

### (1) AC-006 — overlay mobile vs sidebar cố định desktop (CSS `@media`/Tailwind `md:` thật)
- Viewport 375x667 (mobile): `<nav>` đóng ban đầu nằm off-screen (`boundingBox().x = -252`, class chứa `-translate-x-full`). Bấm nút toggle (`aria-label="Mở menu điều hướng"`) → overlay vào đúng vị trí on-screen (`x = 0`, class chứa `translate-x-0`). Chọn mục nav khác (`Kết nối Binance`) → điều hướng đúng URL và overlay tự đóng lại (class trở về `-translate-x-full`).
- Viewport 1440x900 (desktop): `<nav>` cố định tại `x = 0`, `width = 224` (static, không phải overlay). Nút toggle mobile bị ẩn đúng (`md:hidden` hoạt động). Không có backdrop (`div.bg-black/50`) nào tồn tại trên DOM ở desktop.
- Screenshot: `ac006-mobile-closed.png`, `ac006-mobile-open-overlay.png`, `ac006-desktop-static.png` (lưu local tại thư mục scratch của phiên QA này, không commit vào repo — tương tự cách các QA trước không commit output curl).
- **Kết luận: PASS.**

### (2) AC-009 — contrast NavSidebar/active-state (WCAG AA 4.5:1), cả 2 theme
Đo bằng `page.evaluate(() => getComputedStyle(...))` thật trên link active (`a[aria-current="page"]`) sau khi set theme qua `localStorage.setItem('mtl-theme', ...)` + reload (đúng cơ chế `ThemeProvider` đọc `localStorage` lúc khởi tạo). Tính contrast ratio theo công thức WCAG (relative luminance sRGB).

| Theme | Màu chữ | Màu nền | Contrast ratio | Ngưỡng AA | Kết quả |
|---|---|---|---|---|---|
| Dark | `rgb(250,250,250)` | `rgb(39,39,42)` | **14.27:1** | 4.5:1 | PASS |
| Light | `rgb(26,29,33)` | `rgb(226,229,233)` | **13.38:1** | 4.5:1 | PASS |

Cả 2 theme vượt xa ngưỡng AA (margin rất lớn), đúng với việc token `--color-text-primary`/`--color-border` ở cả 2 theme trong `src/index.css` đều được chọn với độ tương phản cao. Screenshot: `ac009-dark-active-state.png`, `ac009-light-active-state.png`.
- **Kết luận: PASS.**

### (3) So khớp bằng mắt với near.com (`.demo/home/home.png`, `.demo/home/account.png`)
Chụp screenshot desktop full-page thật (`visual-desktop-full.png`, theme dark, 1440x900) và đối chiếu trực tiếp với 2 ảnh tham chiếu. Nhận xét định tính (không pixel-perfect):
- Bố cục sidebar trái cố định, header phải căn phải (theme toggle + đăng xuất) — khớp.
- Active-state là pill bo góc (`rounded-xl`), màu nền trung tính (`--color-border`) thay vì màu accent — đúng chủ ý "active-state pill trung tính" ghi trong design rev r2, khớp tinh thần near.com (near.com dùng nền xám nhạt cho mục "Home" đang chọn, không dùng màu nhấn).
- Icon dạng line-style đơn giản (SVG outline) — cùng phong cách với near.com, dù bộ icon cụ thể khác nhau (không yêu cầu trùng icon, chỉ yêu cầu tinh thần near.com).
- Grouping theo nhãn in hoa nhỏ, màu nhạt (`TÀI KHOẢN`, `KẾT NỐI SÀN`) — khớp pattern near.com không có nhãn nhóm hiển thị trong ảnh tham chiếu nhưng cùng visual weight/spacing.
- Không phát hiện sai lệch đáng kể nào (không có defect).
- **Kết luận: PASS (định tính).**

### Kết luận WARN-N01
Cả 3 phần NOT_RUN trước đây nay đều có evidence PASS bằng browser thật, không phát hiện defect. `features/app-navigation-shell/decision.json`: WARN-N01 chuyển **OPEN → RESOLVED**; đây là điều kiện chặn DONE duy nhất còn lại (đã rà soát lại toàn bộ blockers/open_questions/risks/conditions) → **stage QA → DONE**.
