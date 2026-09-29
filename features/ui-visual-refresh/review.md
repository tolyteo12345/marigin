# Code Review: ui-visual-refresh (rev 2 — review lại sau invalidation)

Owner: code-review-agent (độc lập, không phải người viết implementation, không tham gia review rev 1)
Decision: features/ui-visual-refresh/decision.json

## Bối cảnh review lại
Review rev 1 (nội dung trước đây của file này, đã bị **thay thế hoàn toàn** bởi bản này) đã APPROVED implementation revision 1. Sau đó user tự xem UI thật và phản hồi "quá xấu, không giống Hyperliquid". Điều tra xác nhận: rev 1 chỉ áp đúng token màu nhưng layout vẫn là scaffold cũ (`#root` cố định 1126px, `border-inline`, không card, không center) — một lỗ hổng trong `design/ui-visual-refresh.md` rev 1 (thiếu mục "page composition"), không phải lỗi implementation không khớp spec rev 1. Coordinator đã: cập nhật design lên rev 2 (thêm mục "Layout / composition"), sửa code theo spec mới (implementation rev 2), tự chụp screenshot thật (Playwright) xác nhận layout mới. Theo `workflows/feature-development.md` mục "Invalidation" — "Design đổi → frontend implementation readiness/review/QA reset" — review và QA rev 1 đã bị invalidate đúng quy trình; đây là lần review độc lập từ đầu trên implementation revision 2, không kế thừa kết luận rev 1.

## Input revisions đã đối chiếu
- requirements/ui-visual-refresh.md rev 2
- analysis/ui-visual-refresh-feasibility.md rev 1
- architecture/ui-visual-refresh.md rev 1
- design/ui-visual-refresh.md **rev 2** (mục mới "Layout / composition", "Ghi chú rev 2")
- features/ui-visual-refresh/implementation.md **rev 2** (implementation_revision: 2 trong decision.json)
- Diff thật (working tree so với HEAD trên `feature/ui-visual-refresh`, chưa commit):
  - Modified: `frontend/src/App.tsx`, `frontend/src/index.css`, `frontend/src/main.tsx`
  - New: `frontend/src/theme/{theme-context.ts, ThemeProvider.tsx, useTheme.ts, ThemeToggle.tsx, ThemeProvider.test.tsx}`
  - `git status --porcelain` xác nhận không có file nào khác bị đổi (không đụng `components/common/*`, `LoginForm.tsx`, `RegisterForm.tsx`, `LogoutButton.tsx`, `TelegramLoginButton.tsx`, `AccountLinkPanel.tsx`, không đụng `frontend/src/api/*`, backend, `package.json`, DB).

## Scope
Vẫn thuần visual/layout theo requirement rev 2 — rev 2 chỉ bổ sung page composition (`.app-header`/`.app-main`/`.card`) lên trên token đã có ở rev 1, không mở rộng business logic/API/DB. Xác nhận bằng diff thật: 0 thay đổi ngoài CSS + `App.tsx` (chỉ cấu trúc JSX bọc, không đổi logic `isLoggedIn`/`showRegister`) + wiring `ThemeProvider` ở `main.tsx`.

## Findings
Không có finding BLOCKER/MAJOR/MINOR nào về correctness/security/compliance/business-logic. Không phát hiện scope creep hay vi phạm "sửa đúng phẫu thuật".

## Đối chiếu AC với code thực tế (rev 2)
| AC | Kết quả | Ghi chú |
|---|---|---|
| AC-001 (LoginForm/RegisterForm dùng token mới, có layout đúng) | PASS — code khớp token (đã verify lại từ rev 1) **và** layout mới đã tự chụp xác nhận thật (xem mục "Xác nhận trực quan tự thực hiện") | Không còn NOT_RUN/WARNING cho phần visual — đã có ảnh thật |
| AC-002 (AccountLinkPanel trạng thái linked/unlinked/error) | Code khớp (`.inline-message-alert`/`.inline-message-status`, không đổi so với rev 1) và bọc trong `.card` giống các màn hình đã chụp | **Chưa chụp được ảnh thật cho chính AccountLinkPanel** — cần backend thật để đăng nhập (xem mục "Gap còn lại") |
| AC-003 (common component tự động nhận style, không đổi interface) | Verified — `Button`/`TextField`/`InlineMessage` props không đổi (0 diff các file này) | Verified qua code |
| AC-004 (test cũ vẫn pass) | Verified thật — tự chạy `npm test -- --run`: 4 test files, **12/12 pass** | Khớp implementation.md |
| AC-005 (toggle chuyển đúng dark↔light) | PASS — cơ chế đúng (đã verify rev 1) và tự chụp xác nhận cả 2 theme trên layout mới (card đổi màu đúng, không phần tử giữ màu cũ) | Xem screenshot đính kèm |
| AC-006 (persist qua reload) | Verified qua `ThemeProvider.test.tsx` (mô phỏng remount) + code — không đổi so với rev 1 | Không nằm trong phạm vi thay đổi rev 2 |

## Đối chiếu diff thật với design rev 2 / implementation.md rev 2
- `frontend/src/index.css`: đã bỏ đúng `#root { width: 1126px; ... border-inline; text-align: center }` cũ. Thêm `--radius-lg: 12px`, `.app-header` (flex, `justify-content: flex-end`, border-bottom), `.app-main` (`flex:1`, center 2 trục), `.card` (`max-width: 420px`, `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow)`, `padding: var(--space-lg)`), `.card .btn { width: 100% }`. Khớp từng chi tiết với bảng cấu trúc trong design rev 2 mục "Layout / composition".
- `frontend/src/App.tsx`: cả 2 nhánh (`isLoggedIn` true/false) đều bọc nội dung trong `.app-main > .card`, `.app-header` tách riêng chứa `ThemeToggle` (+ `LogoutButton` khi đã đăng nhập). Logic `isLoggedIn`/`showRegister`/callback không đổi — xác nhận bằng diff (chỉ JSX wrapper, không đổi `useState`/handler). Đúng ràng buộc "một card mỗi nhánh, không lồng card trong card" của design.
- `frontend/src/main.tsx`: bọc `<App />` bằng `<ThemeProvider>` — không đổi so với rev 1, không nằm trong phạm vi sửa rev 2 (đúng, vì rev 2 chỉ sửa layout, không sửa theme mechanism).
- Không phát hiện thay đổi nào ngoài mô tả trong implementation.md rev 2 mục "Thay đổi code rev 2".

## Xác nhận trực quan tự thực hiện (không chỉ tin implementation.md)
Tự chạy `npm run dev` (port 5174, xác nhận bằng `curl`), tự cài Playwright tạm thời (`npm install playwright --no-save` trong thư mục scratch ngoài repo, không sửa `package.json` của app — đúng cách coordinator đã làm), viết script Node dùng `chromium.launch()` để chụp 3 màn hình thật:
1. **Dark, tab Email/Password**: card căn giữa cả 2 trục, nền `--color-surface` phân biệt rõ với nền trang gần đen, viền + shadow nhẹ tạo độ nổi, input và 2 button full-width đồng bộ chiều rộng, accent teal (`#00D4AA`) rõ ràng cho tab active và primary button, `ThemeToggle` "🌙 Dark" góc trên phải trong `.app-header` có border-bottom tách biệt. Khớp mô tả Hyperliquid-style trong design rev 2 (card, không tràn full-width, không để trống lớn).
2. **Light, tab Email/Password**: toggle qua light đổi đúng toàn bộ — nền trắng, card nền `#F5F6F8`, accent xanh đậm hơn (`#007A5E`), không còn phần tử nào giữ màu dark cũ (border, text, background đều đổi đồng bộ). Không phát hiện flash hay phần tử lệch theme.
3. **Dark, form Register** (sau khi bấm "Chưa có tài khoản? Đăng ký"): cùng `.card`, hiển thị đúng validation hint ("Password tối thiểu 8 ký tự"), layout không vỡ, button "Đăng ký" full-width nhất quán với Login.

Không phát hiện vấn đề thị giác nào user có khả năng tiếp tục phàn nàn (không tràn viền, không lệch căn giữa, không khó đọc chữ, contrast rõ ràng bằng mắt ở cả 2 theme). Kết luận: layout mới đúng như spec "Layout / composition" rev 2 và đúng hướng Hyperliquid-style mà user mong đợi — khác biệt rõ rệt so với mô tả rev 1 (tràn full-width, để trống lớn, không card).

Không chụp được: Telegram tab (không click trong lần chạy tự thực hiện này, nhưng cấu trúc là cùng `.card` không đổi cấu trúc nên rủi ro tương đương với 3 case đã chụp — implementation.md rev 2 đã chụp thêm case này trước đó) và AccountLinkPanel (xem "Gap còn lại").

## Test evidence — tự chạy lại
```
cd frontend && npm test -- --run
Test Files  4 passed (4)
     Tests  12 passed (12)
```
```
cd frontend && npm run build
✓ 31 modules transformed, built in ~100ms, no errors
```
```
cd frontend && npm run lint
src/components/AccountLinkPanel.tsx:30:10: warning react(set-state-in-effect) ...
```
Đúng 1 warning duy nhất. Tự xác nhận pre-existing (không do thay đổi này) bằng `git stash -u` rồi chạy lại lint trên working tree sạch: **cùng warning xuất hiện** → không phải regression từ implementation rev 2. Khớp claim implementation.md.

## Checklist AGENTS.md (rà lại như lần trước)
- Security/secrets: không có secret trong diff; `localStorage` chỉ lưu string `'dark'|'light'`.
- Business logic: 0 thay đổi trong `LoginForm.tsx`, `RegisterForm.tsx`, `LogoutButton.tsx`, `TelegramLoginButton.tsx`, `AccountLinkPanel.tsx`, `frontend/src/api/*` — xác nhận bằng diff thật, không chỉ tin implementation.md.
- Common component interface: `Button`/`TextField`/`InlineMessage` props không đổi (0 diff các file này), `ThemeToggle` dùng `Button variant="secondary"` nguyên trạng.
- Accessibility: `role="alert"`/`role="status"` giữ nguyên (component không đổi). Focus outline `.field input:focus-visible` vẫn có, không bị xoá. `ThemeToggle` giữ `aria-pressed`/`aria-label` như rev 1, không đổi ở rev 2.
- Swagger/Postman/docs/DATABASE.md: không áp dụng — không có API/DB nào thay đổi.

## Gap còn lại cần user biết (không phải BLOCKER cho APPROVE, nhưng chưa DONE)
**AccountLinkPanel (màn hình sau khi đăng nhập) chưa có ảnh chụp thật ở cả rev 1 lẫn rev 2.** Lý do khách quan: cần backend thật chạy để đăng nhập, ngoài khả năng môi trường frontend-only hiện tại (kể cả lần review này). Đánh giá rủi ro:
- Về code: `App.tsx` bọc `AccountLinkPanel` trong đúng `.app-main > .card` giống hệt cấu trúc đã chụp cho LoginForm/RegisterForm — không có CSS riêng nào khác áp dụng cho nhánh này.
- `AccountLinkPanel.tsx` chính nó **không đổi gì** (0 diff qua toàn bộ workflow từ rev 1 đến rev 2) — chỉ style thừa hưởng từ `.inline-message-*`/`.card` chung đã verify qua 2 lần chụp AccountLinkPanel không tự có layout riêng nào khác biệt (không có class CSS đặc thù ngoài `.inline-message-*` đã kiểm tra).
- Rủi ro thấp về mặt kỹ thuật, nhưng đây vẫn là gap thật: nội dung bên trong AccountLinkPanel (badge trạng thái linked/unlinked/error, có thể nhiều dòng text hơn form login) có thể có vấn đề layout riêng (tràn card, wrap chữ xấu) mà chỉ nhìn ảnh thật mới phát hiện được — giống hệt bài học từ chính vụ rev 1 (code "khớp spec theo lý luận" nhưng ảnh thật cho thấy vấn đề khác). Không nên coi "rủi ro thấp" là đủ để bỏ qua bước xác nhận trực quan cho màn hình này.
- Đây là đúng nội dung COND-002 hiện có trong decision.json (owner: user, due_gate: DONE) — review này xác nhận điều kiện đó vẫn cần thiết và hợp lý, không đề xuất gỡ bỏ.

## Đề xuất trạng thái
**review_status: APPROVED**, gắn `implementation_revision: 2`.

Điều kiện đi kèm (không chặn APPROVE, nhưng bắt buộc trước khi coi feature DONE — khớp COND-002 đã có trong decision.json):
1. User tự xem lại UI rev 2 (đặc biệt đối chiếu với cảm nhận "giống Hyperliquid" mà user đã yêu cầu) — reviewer đã tự chụp và thấy đạt, nhưng quyết định cuối cùng vẫn thuộc về user theo AGENTS.md.
2. AccountLinkPanel cần được user tự kiểm tra bằng mắt khi có backend thật để đăng nhập — chưa có ảnh chụp thật cho màn này ở bất kỳ revision nào.

Không có finding nào yêu cầu quay lại IMPLEMENTATION.
