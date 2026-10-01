# QA: binance-read-only-connection

Owner: coordinator (qa-agent role) | Reviewed revision: sha256:9e701ac0b274ef9194d9838046450fae525b0101574f715e353e6f54ba559fe3 (review APPROVED tại `features/binance-read-only-connection/review.md` sha256:d544fbff6a4f17352790db45f5992fcb03f12265fa74ba4713b91266307451ea)
Requirement: sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc | Architecture: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210 | Design: sha256:295199cf09e008a4a4ea057f4e039eb81431207b0abaef059988d7c41fdfa90c
Decision: features/binance-read-only-connection/decision.json

## Bằng chứng đã tự chạy lại (không chỉ tin review.md)
```
cd backend && npx tsc -b --noEmit && npx nest build   # sạch
cd backend && npm test
Test Suites: 8 passed, 8 total
Tests:       69 passed, 69 total
cd backend && DATABASE_URL=...margin_trading_test BINANCE_SECRET_ENCRYPTION_KEY=<key> npm run test:e2e
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
cd frontend && npx tsc -b && npm run build && npm test -- --run
Test Files 5 passed (5) / Tests 18 passed (18)
```
Restart lại backend dist thật (`node dist/main`), chạy `newman run backend/postman/margin-trading-binance-connections.postman_collection.json` — 13/13 request pass, 0 fail — xác nhận API thật khớp Swagger/Postman, không chỉ đọc tài liệu qua loa (theo yêu cầu AGENTS.md).

## Đối chiếu Acceptance Criteria
| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC-001 | PASS | e2e Postgres thật + verify thật với Binance (2 lần gọi `api.binance.com`, garbage key) |
| AC-002 | PASS | unit (mock -1022) + e2e (mock) + **verify thật**: Binance trả `-2008 "Invalid Api-Key ID."` cho garbage key, hệ thống map đúng `INVALID` sau khi sửa `binance-error-mapping.ts` |
| AC-003 (+ 003b) | PASS | unit test 2 nhánh riêng biệt (MARGIN_2 "Pro" vs lỗi khác "chưa mở"), message không trùng nhau |
| AC-004 | PASS | unit: permission check thành công lưu snapshot; thất bại → `permissionUnknown=true` fail-closed, không ghi đè snapshot cũ. Frontend: banner permission-too-broad + nút "Đã hiểu" có test riêng (`BinanceConnectionsPage.test.tsx`) |
| AC-005 | PASS | e2e: `fetchedAt` đổi mỗi lần gọi, field giữ nguyên string (không parse số) |
| AC-006 | PASS | e2e IDOR: 4 endpoint (get/verify/snapshot/revoke) đều 404 cho user không sở hữu, user sở hữu vẫn thấy được (loại trừ do row không tồn tại) |
| AC-007 | PASS | e2e: sau revoke, `encryptedApiKey.length === 0`/`encryptedApiSecret.length === 0` trong Postgres thật, biến mất khỏi `GET /api/binance-connections` |
| AC-008 | PASS | unit + e2e: timeout/network → `VERIFY_UNKNOWN` (không phải INVALID); rate-limit 429 → kèm `retryAfterSeconds` đúng giá trị |

## Boundary / concurrency / API-failure — riêng ngoài AC
- **Nonce reuse AES-GCM** (đã phát hiện và fix ở review): test `secret-vault.service.spec.ts` "generates a fresh random IV on every call" xác nhận 2 lần encrypt không bao giờ trùng IV.
- **Decrypt failure (key rotation sai cách)**: PASS — 2 test mới xác nhận map về `VERIFY_UNKNOWN`/503 thay vì throw chưa xử lý (finding fix ở review).
- **Concurrency verify (double-click)**: PASS ở mức unit test (mock `pg_try_advisory_xact_lock` trả `locked:false` → không gọi Binance lần 2). **Chưa test concurrency thật** (2 request `Promise.all` chạm Postgres thật cùng lúc) — cơ chế dùng tính năng chuẩn của Postgres (`pg_try_advisory_xact_lock`), đánh giá rủi ro residual thấp, chấp nhận cho MVP giống nhận định ở `qa/user-authentication.md` cho case tương tự.
- **Rate limit thật từ Binance**: chưa quan sát được 429 thật từ Binance (2 lần gọi thật trong QA này đều dưới ngưỡng rate limit) — chỉ verify qua mock. Không phải gap nghiêm trọng vì logic đọc `Retry-After` header đã tổng quát, không phụ thuộc giá trị cụ thể.

## Việc còn lại — bắt buộc trước DONE (không chặn PASS_WITH_WARNINGS)
1. **RISK-001 mitigation — manual smoke test với tài khoản margin thật CÓ HIỆU LỰC** (khác với 2 lần verify thật đã làm ở review — đó là garbage key, chỉ xác nhận đường lỗi). Cần một tài khoản Binance Cross Margin Classic thật (dev/QA), API key read-only thật, để xác nhận: (a) field response thật của `GET /sapi/v1/margin/account` khớp đúng tên/định dạng đã giả định (EV-001) khi verify thành công (`status=VERIFIED`), (b) `GET /sapi/v1/account/apiRestrictions` trả đúng field đã giả định (EV-003), (c) các Binance error code còn lại trong `BINANCE_AUTH_ERROR_CODES` (-1021, -1022, -2014, -2015) — hiện chỉ `-2008` đã tự verify thật, phần còn lại vẫn NEEDS_VERIFICATION theo docs. **qa-agent (tôi) không có tài khoản margin thật/API key thật hợp lệ — không thể tự thực hiện, không giả lập kết quả.** Cần user tự thực hiện và báo lại evidence.
2. **Click-through UI thật trong trình duyệt** (add connection → xem trạng thái → xem snapshot → revoke) — môi trường này không có công cụ trình duyệt. Đã verify được: tsc/build/lint sạch, 18 unit test hành vi (React Testing Library, mock fetch), API thật hoạt động đúng qua Postman — nhưng CHƯA xác nhận bằng mắt UI hiển thị đúng như design/binance-read-only-connection.md mô tả (vd. bảng userAssets, banner permission, format "Dữ liệu tại HH:MM:SS UTC..."). Cần user hoặc môi trường có trình duyệt xác nhận.
3. `docs/DATABASE.md` đã cập nhật đúng deviation `encryptionIvApiSecret` — xác nhận khớp, không phải việc còn lại nhưng ghi nhận đã kiểm tra.

## Kết luận
Toàn bộ test tự động pass (69 unit + 16 e2e backend, 18 unit frontend), verify thật với Binance thật (đường lỗi) và với Postman/newman qua backend thật. Không phát hiện correctness/security issue nào ngoài 3 finding đã fix ở review. Không có warning nào che giấu vấn đề correctness/security/financial.

**Đề xuất qa_status: PASS_WITH_WARNINGS** — 2 việc còn lại (mục 1, 2 ở trên) đều cần tài khoản Binance thật hoặc môi trường trình duyệt mà qa-agent không có trong phiên này, không phải lỗi code hay thiếu sót có thể tự đóng. Không chặn PASS vì mọi AC đã có bằng chứng tự động + ít nhất 1 lần verify thật (đường lỗi) với Binance, nhưng chặn DONE cho tới khi user xác nhận cả 2 mục.

## Cập nhật 2026-10-01 — click-through UI thật (WARN-002, phần 2/2)

Môi trường phiên này có công cụ trình duyệt (Playwright + Chromium thật, không phải mô phỏng). Thực hiện đúng mục "Việc còn lại #2" ở trên: add connection → xem trạng thái → xem snapshot → revoke, trên stack thật (Postgres qua docker-compose, backend `nest start --watch` cổng 3010, frontend `vite` cổng 5180 proxy `/api` sang 3010). Đăng ký 1 user thật qua UI (`/login` → "Chưa có tài khoản? Đăng ký" → `POST /api/auth/register`), KHÔNG dùng API key Binance thật ở bất kỳ bước nào (RISK-001 — tài khoản margin thật — vẫn ngoài phạm vi phiên này, xem mục riêng bên dưới). Ảnh chụp màn hình lưu tại `features/binance-read-only-connection/evidence/browser-verify-2026-10-01/`.

### a. Add connection với garbage API key/secret — PASS
Thêm connection `"QA garbage key"` với API Key/Secret là chuỗi giả (`GARBAGE_API_KEY_NOT_REAL_...`). Verify đồng bộ chạy ngay trong request tạo, gọi `api.binance.com` thật (không mock), Binance trả lỗi auth thật → UI hiển thị đúng theo design mục 3: card có `InlineAlert` "Kết nối không hợp lệ: API key hoặc secret sai hoặc đã hết hạn.", nút "Xác minh lại" và "Xoá kết nối". Khớp `ConnectionStatusCard` nhánh `status === 'INVALID'`.
Ảnh: `04-add-connection-submitting.png`, `05-add-connection-result.png`.

### b. Connection VERIFIED + bảng userAssets — PASS MỘT PHẦN, có giới hạn ghi rõ
`getAccountSnapshot()` (`backend/src/binance-connection/binance-connection.service.ts`) luôn gọi lại `adapter.getCrossMarginAccount` thật mỗi lần xem snapshot (không cache, đúng AC-005/BR-008) — nghĩa là để xem bảng `userAssets` thật sự render dữ liệu, bắt buộc phải có API key Binance thật hợp lệ. Không có cách nào khác hợp lý để trigger thành công nhánh này mà không sửa `backend/src/binance-adapter/binance-read-only-adapter.service.ts` (cấm theo task) hoặc không gọi Binance thật (cấm theo RISK-001 exclusion) — **bỏ qua phần render bảng `userAssets` thành công, ghi nhận là giới hạn môi trường, không phải defect.**

Để verify UI cho trạng thái `VERIFIED` và banner permission-too-broad (phần c) mà không gọi Binance thật, chèn trực tiếp 1 row vào Postgres test/dev db (`INSERT INTO "BinanceConnection" ...`, `status='VERIFIED'`, `accountType='MARGIN_1'`, `encryptedApiKey`/`encryptedApiSecret` là bytes giả `deadbeef` không decrypt được thành key thật) — đây là fixture DB thuần, không phải gọi Binance. Kết quả:
- Card hiển thị đúng `InlineStatus` xanh "Đã xác minh — Cross Margin Classic." (khớp design mục 3, nhánh `status === 'VERIFIED'`). Ảnh: `06-verified-and-permission-banner.png`.
- Bấm "Xem số dư margin" → gọi `GET /account-snapshot` thật → backend decrypt ciphertext giả thất bại → map đúng về lỗi 503 theo nhánh đã implement (`binance-connection.service.ts` dòng ~265-271, "decrypt failed... treat the same as could not confirm") → UI hiển thị đúng `InlineAlert` "Không thể tải dữ liệu (mất kết nối hoặc hết thời gian chờ), vui lòng thử lại." + nút "Thử lại", khớp `AccountSnapshotPanel` nhánh lỗi 503. Đây là bằng chứng UI xử lý đúng đường lỗi của snapshot, không phải đường thành công. Ảnh: `08-snapshot-result.png`.

### c. Banner permission-too-broad — PASS
Permission snapshot của row seed ở trên có `enableWithdrawals=true` và `enableSpotAndMarginTrading=true`. UI hiển thị đúng `InlineAlert` "Cảnh báo: API key này có quyền vượt quá mức cần thiết. Khuyến nghị tạo lại key chỉ bật Enable Reading." kèm nút "Đã hiểu, tiếp tục" — khớp design mục 3 (`permissionTooBroad()` trong `ConnectionStatusCard.tsx`). Banner này đọc thẳng từ `permissionSnapshot` lưu trong Postgres (không gọi Binance khi list/get), nên fixture DB đủ để verify đúng, không cần tài khoản thật. Ảnh: `06-verified-and-permission-banner.png`.

### d. Revoke connection — PASS
Revoke cả 2 connection (seed VERIFIED và garbage INVALID) qua nút "Xoá kết nối" (có `window.confirm` native, Playwright accept dialog). Sau mỗi lần revoke, connection biến mất khỏi danh sách ngay (không chỉ đổi trạng thái) — đúng thiết kế WARN-001 đã resolve (`list()` filter `deletedAt: null`). Sau khi revoke hết cả 2, trang hiển thị đúng empty state "Bạn chưa có kết nối Binance nào." Ảnh: `09-before-revoke.png`, `10-after-revoke.png`, `11-after-revoke-garbage-list-empty.png`.

### Format timestamp — xác nhận khớp design
Cả `lastVerifiedAt` ("Xác minh gần nhất: HH:MM:SS UTC dd/mm/yyyy") trên card đều render đúng format "HH:MM:SS UTC dd/mm/yyyy" theo design mục 3 (vd "02:52:29 UTC 01/10/2026"). Format "Dữ liệu tại {fetchedAt}" của snapshot panel (design mục 4) không verify được bằng mắt vì nhánh thành công không trigger được (xem mục b) — code `AccountSnapshotPanel.tsx` dùng cùng hàm `formatFetchedAt` với cùng pattern đã verify ở `lastVerifiedAt`, đánh giá rủi ro sai lệch thấp nhưng CHƯA phải bằng chứng trực tiếp bằng mắt.

### Defect phát hiện
Không phát hiện defect nào khi so khớp UI với design/binance-read-only-connection.md ở các nhánh verify được trong phiên này (INVALID, VERIFIED trạng thái, permission-too-broad banner, snapshot lỗi 503, revoke/empty state).

### Kết luận phần này
WARN-002 phần "click-through UI thật trong browser" (mục 2 của "Việc còn lại") — **PASS**, với 1 giới hạn đã ghi rõ: nhánh snapshot THÀNH CÔNG (bảng `userAssets` với dữ liệu thật) không verify được bằng mắt vì đòi hỏi tài khoản Binance margin thật, thuộc đúng phạm vi loại trừ của RISK-001 (mục 1 của "Việc còn lại"), không phải việc có thể tự làm thêm trong phiên này. WARN-002 phần "RISK-001 mitigation — tài khoản margin thật" **VẪN OPEN, chưa làm, chờ user**.
