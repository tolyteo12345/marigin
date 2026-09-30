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
