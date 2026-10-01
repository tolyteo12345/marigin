# QA: ui-visual-refresh

Owner: coordinator (vai trò qa-agent) | Reviewed revision: implementation rev 2 (review.md rev 2 APPROVED)
Decision: features/ui-visual-refresh/decision.json

## Rev 2 — bối cảnh
QA rev 1 (PASS_WITH_WARNINGS) bị invalidate vì design đổi lên rev 2 sau khi user phản hồi UI rev 1 "quá xấu, không giống Hyperliquid" (thiếu spec layout/composition, không phải lỗi tuân thủ token). Implementation/review đã làm lại (rev 2), lần này có ảnh chụp thật (Playwright) xác nhận layout card-centered đúng hướng Hyperliquid cho 4/5 màn hình. QA rev 2 retest lại từ đầu.

## Scope
Feature thuần visual/CSS: design tokens dark/light + layout composition (card/center), restyle 5 màn hình/component hiện có + common library, theme toggle + persistence. Không có financial/API/DB/concurrency/provenance nào để test. QA tập trung vào AC-001..006.

## Retest — tự chạy lại đúng revision đã review (rev 2)
```
cd frontend && npm test -- --run
Test Files  4 passed (4)
     Tests  12 passed (12)

cd frontend && npm run build
✓ 31 modules transformed, built in 91ms, no errors
```
Khớp implementation.md rev 2 và review.md rev 2.

## Acceptance criteria — kết quả

| AC | Kết quả | Evidence |
|---|---|---|
| AC-001 (LoginForm/RegisterForm dùng token mới, không unstyled) | **PASS** | Ảnh chụp thật (Playwright, cả dark/light, cả reviewer và coordinator độc lập chụp) xác nhận card căn giữa, input/button full-width, token đúng — không còn NOT_RUN như rev 1 |
| AC-002 (AccountLinkPanel state indicator phân biệt rõ) | **PASS_WITH_WARNING** | Code/CSS xác nhận (`--color-danger`/`--color-success` + border-left, cùng `.card` như màn đã chụp). Ảnh chụp trực tiếp màn AccountLinkPanel: **NOT_RUN** — cần backend thật để đăng nhập, ngoài khả năng môi trường frontend-only. Xem COND-002 |
| AC-003 (common component tự nhận style, không sửa call site) | **PASS** | Verified — props/interface Button/TextField/InlineMessage không đổi |
| AC-004 (test hiện có vẫn pass) | **PASS** | Retest thật: 12/12 pass (8 cũ nguyên vẹn) |
| AC-005 (toggle đổi đúng dark↔light ngay lập tức, không phần tử giữ màu cũ) | **PASS** | Ảnh chụp thật xác nhận toggle đổi toàn bộ đúng, không sót phần tử; test DOM cũng verify cơ chế |
| AC-006 (persist qua reload) | **PASS** | Test mô phỏng unmount/remount đọc đúng `localStorage['mtl-theme']` |

Không có AC nào FAIL. AC-001/AC-005 chuyển từ PASS_WITH_WARNING (rev 1) sang **PASS** hoàn toàn nhờ ảnh chụp thật rev 2.

## Đối chiếu COND-001/COND-002 (decision.json)
- COND-001 (thiếu ảnh chụp rev 1): đã RESOLVED trước khi QA rev 2 bắt đầu.
- COND-002 (user tự xem lại rev 2 + AccountLinkPanel, due_gate DONE): vẫn **OPEN**. QA không thể tự đóng — 2 lý do cần user: (1) ảnh chụp tự động dù đúng spec vẫn không thay thế hoàn toàn đánh giá thẩm mỹ chủ quan của người yêu cầu ban đầu ("giống Hyperliquid" là judgment call của user, không phải tiêu chí đo được tuyệt đối); (2) AccountLinkPanel chưa có ảnh chụp nào ở cả 2 rev.

## Đề xuất trạng thái
**qa_status: PASS_WITH_WARNINGS**.
Warning duy nhất còn lại: AC-002 PASS_WITH_WARNING vì AccountLinkPanel chưa được xác nhận trực quan (không ảnh hưởng correctness/security/financial invariant). Cần user: (1) xác nhận rev 2 đã đúng ý ("giống Hyperliquid" chưa) qua ảnh chụp coordinator/reviewer đã chụp hoặc tự chạy `npm run dev`, và (2) khi có backend thật, xem qua AccountLinkPanel một lần để đóng COND-002 trước khi feature DONE.

## Cập nhật 2026-10-01 (rev 3 — Tailwind migration + near.com style)
Chạy lại toàn bộ evidence (không chỉ tin review.md): `tsc -b` sạch, `vitest run` 25/25 pass, `npm run build` thành công, `npm run lint` không warning mới. Đối chiếu AC-001..006 (BR-001..004 của requirement rev 2): không có AC nào liên quan tới nội dung/hành vi bị ảnh hưởng (toàn bộ thay đổi là CSS/trình bày), nên PASS/PASS_WITH_WARNING trạng thái hiện có của từng AC giữ nguyên — không cần chấm lại từ đầu.

**Điểm mới cần xác nhận (chưa từng có ở rev 1/2)**: toàn bộ palette màu đổi nhẹ (gần near.com hơn) và style mọi component đổi hoàn toàn sang Tailwind — phạm vi ảnh hưởng rộng hơn hẳn các lần sửa trước (vốn chỉ chỉnh layout 1-2 chỗ). Không có công cụ trình duyệt thật trong môi trường này để so khớp trực tiếp với `.demo/*.png` mà user cung cấp — đây là NOT_RUN cho riêng tiêu chí "giống near.com" (không phải AC chính thức trong requirement, mà là yêu cầu trực tiếp mới nhất của user), không phải FAIL.

**qa_status: PASS_WITH_WARNINGS** (không đổi). Thêm COND-003 (owner: user, due_gate: DONE): user tự chạy `npm run dev`, so sánh bằng mắt với `.demo/home/*.png`/`.demo/login/*.png`, xác nhận đạt hoặc yêu cầu chỉnh thêm — bắt buộc trước khi coi feature DONE trở lại (đã DONE trước đó nhưng thay đổi diện rộng này cần user re-confirm, không chỉ dựa vào bugfix nhỏ như các lần trước).
