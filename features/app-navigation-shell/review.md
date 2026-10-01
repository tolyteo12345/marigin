# Code Review: app-navigation-shell

Owner: coordinator (code-review-agent role) | Decision: features/app-navigation-shell/decision.json

Input:
- Requirement: sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25
- Architecture: sha256:6ab64ae1c92a5e28b7a0c60ab863a7c7ee7b11ed6f46e7ab22e629fe91a020bf
- Design: sha256:d2a66dea812c7363fde3694a282f154f75fa485b24a0eee07d34cba43cf5b14c
- Implementation reviewed: sha256:cfaa1f5409a5df1dd60fe3cca17d13041ce74a46025a76098583d6c649c67151

**Ghi chú độc lập tính**: review này được coordinator thực hiện trong cùng phiên vừa implement (không phải reviewer hoàn toàn tách biệt) — ghi rõ theo đúng tiền lệ của `features/binance-read-only-connection/review.md`. Để bù lại, phần dưới là 1 lượt đọc lại độc lập toàn bộ diff (không chỉ tin implementation.md), có chạy lại test/build/lint thật.

## Soát theo file
- **`router/requireSession.ts`**: catch-all bắt mọi lỗi từ `me()` (không riêng 401) rồi redirect `/login` — khớp hành vi cũ của `App.tsx` (`.catch(() => setIsLoggedIn(false))` cũng không phân biệt lý do lỗi), không phải regression.
- **`router/routes.tsx`**: route "protected" không có `path` (pathless layout) — `index: true` con của nó khớp đúng `"/"`, `account`/`connections/binance` khớp đúng path tuyệt đối tương ứng (xác nhận qua test AC-005 deep-link pass). Route `"*"` nằm NGOÀI cây "protected", không chạy `requireSession` — đúng ý đồ kiến trúc (404 không phân biệt đã đăng nhập hay chưa).
- **`components/layout/AppShell.tsx`**: `.app-header` giữ `justify-content: flex-end` (không đổi), `.app-header-actions` dùng `margin-left: auto` — đây là kỹ thuật flexbox chuẩn khiến auto-margin tự chiếm hết khoảng trống còn lại, ghim `app-header-actions` sát phải và đẩy `nav-toggle-btn` sát trái BẤT KỂ `justify-content` của cha — kiểm tra lại đúng, không phải bug (ban đầu nghi ngờ nhưng xác minh qua CSS spec: auto margin trên flex item override justify-content theo trục đó).
- **`components/layout/NavSidebar.tsx`**: `useEffect([location.pathname, onClose])` gọi `onClose()` mỗi lần đổi route (kể cả lần mount đầu, khi `open` đã là `false` — React bail-out set-state cùng giá trị, không gây render thừa). `onClose` ổn định nhờ `useCallback` ở `AppShell` — không có stale closure, không vi phạm exhaustive-deps.
- **`.nav-sidebar-backdrop`**: conditionally render theo state JS (`open`) bất kể viewport, nhưng CSS mặc định `display:none` ngoài `@media (max-width:768px)` — xác nhận trên desktop dù `open=true` còn sót (vd do resize) thì backdrop vẫn vô hình/không bắt click, không có nguy cơ "kẹt lớp phủ che toàn trang" trên desktop như lo ngại ban đầu của requirement edge case.
- **`pages/NotFoundPage.tsx`**: dùng `<Link to="/account" className="btn btn-primary">` — xác nhận route này không đụng `requireSession`, nội dung tĩnh, không gọi API nào — không có cách nào lộ thông tin trạng thái đăng nhập qua trang này.
- **Dọn orphan**: `grep -rn "dashboard" frontend/src --include=*.tsx --include=*.ts` chỉ còn khớp 1 dòng comment (đã dẫn), xác nhận class `.dashboard`/`.panel + .panel` xoá đúng, không còn tham chiếu nào sót.
- **Backend**: `git status`/`git diff` xác nhận không có file nào trong `backend/` bị đổi — khớp đúng tuyên bố "thuần frontend" của architecture/implementation.

## Finding và fix trong vòng review này
1. **(MEDIUM, đã fix) Thiếu test cho phần JS của AC-006** — toggle sidebar mobile (nút bấm, `aria-expanded`, tự đóng khi chọn mục nav) chưa có test nào trước đó, dù đây là hành vi JS kiểm được hoàn toàn trong jsdom (phần CSS `@media` thật thì đúng là không test được, nhưng phần wiring thì có thể và nên có). Đã thêm 1 test (`routes.test.tsx`: "toggles the mobile sidebar overlay...") — PASS. Cập nhật `implementation.md` (revision mới ở trên).

## Đối chiếu AC (architecture "Validation và rollout")
| AC | Kết quả |
|---|---|
| AC-001 | PASS — test "shows the sidebar with both nav groups..." |
| AC-002 | PASS — test "redirects to the login page... no session" |
| AC-003 | PASS — test "switches page content and active state..." |
| AC-004 | PASS — `aria-current="page"` đúng mục đang xem trong cả 2 test trên |
| AC-005 | PASS — test "renders the correct page when loading a protected URL directly (deep link)" |
| AC-006 | PASS (JS wiring) / KHÔNG kiểm được bằng automated test (CSS `@media` thật) — ghi WARN-N01 ở decision.json, cần verify browser thật trước QA DONE |
| AC-007 | PASS — test "redirects..." xác nhận không có nội dung protected nào từng render trước khi điều hướng |
| AC-008 | PASS — test "shows the 404 page..." |
| AC-009 | KHÔNG kiểm được (cần đo contrast bằng browser thật) — đã ghi WARN-N01, không chặn review vì đây là hạn chế môi trường đã biết trước (giống các feature trước), code dùng đúng token đã có sẵn (đọc lại `index.css`: không có màu hex cứng mới nào ngoài token kế thừa) |
| AC-010 | PASS — test "shows the loading state without the sidebar..." |

## Kết luận
1 finding (thiếu test AC-006 JS wiring) đã fix và verify lại ngay trong vòng review: 25/25 test frontend pass, `tsc -b` sạch, `oxlint` không warning mới, `vite build` thành công, backend không bị đụng tới. Không phát hiện lỗi chặn nào khác (security/CSRF/ownership không áp dụng cho feature này vì không có action tài chính/API mới). 2 điểm không thể kiểm bằng automated test (AC-006 CSS thật, AC-009 contrast thật) đã ghi nhận ở WARN-N01, cần user/QA verify thủ công trước DONE — không phải lỗi chặn implementation.

**review_status: APPROVED**, gắn implementation revision sha256:cfaa1f5409a5df1dd60fe3cca17d13041ce74a46025a76098583d6c649c67151.
