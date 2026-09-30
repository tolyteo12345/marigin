# Code Review: binance-read-only-connection

Owner: coordinator (code-review-agent role) | Decision: features/binance-read-only-connection/decision.json

Input:
- Requirement: sha256:169ac1c4dd000a187ecfcd150e43f8d0a74b752c485782e51b87418d25f213dc
- Architecture: sha256:49b994bf10431bd82b1ce4f4d4f68a80b5ed60baeff29ed754814a3e63e01210
- Design: sha256:295199cf09e008a4a4ea057f4e039eb81431207b0abaef059988d7c41fdfa90c
- Implementation reviewed: sha256:9e701ac0b274ef9194d9838046450fae525b0101574f715e353e6f54ba559fe3

**Ghi chú độc lập tính**: review này được thực hiện ngay sau khi implement trong cùng phiên làm việc (theo yêu cầu user "hoàn tất, đóng blocker" ngay). 3 finding dưới đây được phát hiện và fix TRONG QUÁ TRÌNH implement/tự-rà-soát trước khi coi implementation "READY" (không phải sau khi một reviewer hoàn toàn tách biệt đọc lại) — ghi rõ để coordinator/QA biết mức độ độc lập thực tế, khác hoàn toàn với review của user-authentication (nơi có 1 vòng đọc lại toàn bộ sau khi implementation tự báo cáo xong). Phần dưới đây là vòng đọc lại thêm lần nữa, tập trung soát các khu vực chưa nêu trong implementation.md.

## Finding đã fix trong lúc implement (liệt kê lại để có evidence tập trung 1 chỗ)
1. **Nonce reuse AES-GCM** (CRITICAL, đã fix): architecture's Prisma sketch dùng 1 `encryptionIv` cho cả `encryptedApiKey` và `encryptedApiSecret`. Thêm cột `encryptionIvApiSecret` riêng. Test regression: `secret-vault.service.spec.ts`.
2. **Sai phân loại lỗi Binance thật** (HIGH, đã fix): code `-2008` ("Invalid Api-Key ID") — xác nhận bằng cách gọi thật `api.binance.com` — bị phân loại nhầm thành `UNSUPPORTED_ACCOUNT_MODE` thay vì `INVALID`. Đã thêm vào `BINANCE_AUTH_ERROR_CODES`.
3. **Decrypt failure có thể gây 500 chưa xử lý** (MEDIUM, đã fix): `verify()`/`getAccountSnapshot()` không bọc try/catch quanh `secretVault.decrypt()` — lỗi vận hành (key rotation sai cách) sẽ văng thành exception chưa xử lý thay vì trạng thái graceful. Đã bọc, map về `VERIFY_UNKNOWN`/503.

## Soát thêm (vòng review riêng)
- **CSRF/ownership/mode enforcement**: đọc lại toàn bộ `binance-connection.controller.ts` — đúng `@UseGuards(AuthGuard)` ở class level, `CsrfGuard` thêm cho POST/DELETE, không thiếu route nào. Ownership qua `findOwnedOrThrow` nhất quán ở mọi method kể cả `revoke`.
- **Allowlist Binance**: `BinanceReadOnlyAdapterService` chỉ export đúng 2 method, `private signedGet` không public — không có cách nào gọi endpoint khác qua class này. `grep -rln "api.binance.com" src/` khớp đúng 2 file: `binance-read-only-adapter.service.ts` (fetch thật, đúng chỗ duy nhất được phép) và `binance-error-mapping.ts` (chỉ trong comment giải thích, không có code gọi) — xác nhận không có adapter/HTTP client thứ hai nào chạm Binance.
- **Financial formulas**: `grep -rn "parseFloat\|Number(" src/binance-connection src/binance-adapter` chỉ khớp 1 chỗ — `Number(retryAfterHeader)` để parse header `Retry-After` (giây chờ, không phải field tài chính Binance). Không có `parseFloat`/`Number(...)` nào áp lên `marginLevel`/`userAssets[].*`/bất kỳ field tiền tệ nào — toàn bộ giữ string end-to-end đúng yêu cầu.
- **Secret không lộ**: `ConnectionView`/`toConnectionView` (`connection-view.ts`) chỉ định nghĩa field `id/label/status/accountType/permissionSnapshot/permissionUnknown/lastError/lastVerifiedAt/createdAt/updatedAt` — không có `encryptedApiKey`/`encryptedApiSecret`/IV nào trong shape trả về (chỉ xuất hiện trong 1 dòng comment nhắc lại invariant, không phải field thật). Xác nhận thêm bằng test e2e "secret never in the response" (so cả JSON response lẫn field ciphertext trong DB không chứa plaintext).
- **Audit không log secret**: đọc toàn bộ lời gọi `this.audit.record(...)` trong `binance-connection.service.ts` — `detailsRedacted` không được truyền ở feature này (khác user-authentication có dùng field này), các action chỉ mang `userId/connectionId/action/result/requestCorrelationId`, không có chỗ nào đưa `apiKey`/`apiSecret` vào audit log.
- **Concurrency verify**: đã tự thực nghiệm xác nhận `pg_try_advisory_xact_lock` hoạt động đúng qua unit test "concurrency: a second verify while one is in flight..." — nhưng đây chỉ là test với mock `$queryRaw` trả `locked:false`, KHÔNG phải test đồng thời thật (2 request `Promise.all` chạm Postgres thật). Đánh giá: chấp nhận được cho MVP vì cơ chế (`pg_try_advisory_xact_lock`) là tính năng chuẩn của Postgres, logic ứng dụng xung quanh nó đã đúng theo mock; rủi ro residual thấp.
- **`getAccountSnapshot` minor race** (LOW, không fix — ghi nhận): `findOwnedOrThrow` đọc `status` một lần, sau đó đọc "fresh" chỉ check `deletedAt`, không re-check `status`. Nếu status đổi (vd re-verify concurrent flip sang INVALID) giữa 2 lần đọc, request vẫn gọi Binance bằng secret cũ. Vô hại về bảo mật/dữ liệu (vẫn đúng secret của đúng connection, GET-only), chỉ là 1 lần gọi thừa trong cửa sổ rất hẹp — không đáng để thêm phức tạp cho MVP.
- **Comment lỗi thời**: `backend/src/rate-limit/rate-limit.module.ts` còn nhắc `POST /api/auth/telegram/webhook` (endpoint đã xoá từ r4 của user-authentication) — không liên quan tới feature này, không sửa ở đây (thuộc phạm vi user-authentication, đã ghi nhận ở review.md của feature đó).

## Đối chiếu AC (architecture "Validation và rollout")
| AC | Kết quả |
|---|---|
| AC-001 | PASS — e2e thật (Postgres) + verify thật với Binance (2 lần, garbage key) |
| AC-002 | PASS — unit (mock code -1022) + e2e (mock adapter) + **verify thật** (code -2008 thật) |
| AC-003 (+003b) | PASS — unit test riêng cho cả 2 nhánh (MARGIN_2 vs lỗi khác), message khác nhau xác nhận qua `expect(...).not.toContain('Pro')` |
| AC-004 | PASS — permission check thành công lưu snapshot, thất bại fail-closed (permissionUnknown=true, không ghi đè), unit test cả 2 nhánh; permission-too-broad banner + ack ở frontend có test riêng |
| AC-005 | PASS — e2e xác nhận `fetchedAt` mỗi lần khác nhau, field giữ nguyên string |
| AC-006 | PASS — e2e IDOR test (4 endpoint đều 404 cho user khác, A vẫn thấy được) |
| AC-007 | PASS — e2e xác nhận DB thật: `encryptedApiKey.length === 0` sau revoke, biến mất khỏi list |
| AC-008 | PASS — unit + e2e cho timeout (VERIFY_UNKNOWN, không phải INVALID) và rate-limit (429 kèm retryAfterSeconds) |

## Kết luận
3 finding trên đều đã fix và verify lại (69/69 unit, 16/16 e2e, Postman/newman 13/13, verify thật với Binance 2 lần). Không phát hiện thêm lỗi chặn. 1 ghi nhận LOW (getAccountSnapshot minor race) không cần fix cho MVP.

**review_status: APPROVED**, gắn implementation revision sha256:9e701ac0b274ef9194d9838046450fae525b0101574f715e353e6f54ba559fe3.
