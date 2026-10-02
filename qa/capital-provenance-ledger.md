# QA report: capital-provenance-ledger

Owner: coordinator (qa-agent role) | Implementation revision: sha256:21818a63177d9dbc28e0b0ed2faf6c10701e7f6ad1fac96ee2a8ce89753c241a (review APPROVED tại `features/capital-provenance-ledger/review.md` sha256:6b5e678a2aca32ec2bbe186680290ed5eb8dc6caed57550f53be0b8e5e14f4b3)
Requirement: sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6 | Architecture: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2 | Design: sha256:5f8dda64c3c5006fd13db6f784b13bc0f8fa70a9ca4c0e0d810a73c164586f8f
Environment/mode: backend thật (NestJS dev server, port cô lập 3102) + PostgreSQL thật (local docker, schema đã migrate) + frontend test qua Testing Library (jsdom, không phải browser thật) | Run time: 2026-10-02 ~02:35–02:40 UTC
Decision: features/capital-provenance-ledger/decision.json

## Deviation ghi nhận trong lúc QA (tooling, không phải application code)
Postman collection ban đầu (`backend/postman/margin-trading-capital-provenance-ledger.postman_collection.json`) có 2 vấn đề tự phát hiện khi chạy thật bằng `newman` (không chỉ đọc qua):
1. Thứ tự request "Repay"/"Reconcile" nằm trong folder "Borrow Positions" chạy TRƯỚC khi tạo Allocation Lot — khiến `repay` đóng position thành REPAID trước khi test được case "tạo lot funded từ position OPEN". Đã tách thành folder riêng "Repay & reconcile" đặt sau "Allocation Lots", đúng trình tự chronological thật (khớp design mục 1-10).
2. Prerequest script lấy `baseUrl` bằng `pm.collectionVariables.get('baseUrl')` — bỏ qua `--env-var baseUrl=...` khi chạy `newman` (environment variable có precedence cao hơn collection variable, nhưng `collectionVariables.get()` chỉ đọc đúng collection scope). Lần chạy đầu "pass" chỉ vì 2 server trong môi trường này tình cờ trỏ chung 1 Postgres nên session/CSRF vẫn khớp qua cổng khác — không phải bằng chứng đáng tin cho môi trường khác (CI/staging riêng DB). Đã sửa thành `pm.variables.get('baseUrl')` (đúng scope chain), xác nhận lại: toàn bộ request `GET .../auth/csrf-token` gọi đúng cổng truyền vào.

Đây là lỗi ở tooling QA, không phải ở `backend/src/ledger` — không ảnh hưởng `implementation_revision`/`reviewed_revision` đã APPROVED.

## Bằng chứng đã tự chạy lại (không chỉ tin review.md)
```
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
Test Suites: 9 passed, 9 total
Tests:       89 passed, 89 total

cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build
Test Files  8 passed (8)
Tests       30 passed (30)
```

Server thật (port 3102, tách biệt server dev khác đang chạy trên 3000) + Postgres thật, chạy `newman run backend/postman/margin-trading-capital-provenance-ledger.postman_collection.json --env-var baseUrl=http://localhost:3102/api --env-var setupEmail=<unique>`:
```
requests: 30, failed: 0
prerequest-scripts: 12, failed: 0
test-scripts: 3, failed: 0
```
Toàn bộ luồng (tạo khoản vay → bán tài sản vay → tạo lot funded từ khoản vay → bán lot → reconcile → repay overpayment (422) → repay full (REPAID) → lịch sử → correction → available capital) chạy thật end-to-end, không mock.

Bổ sung bằng curl thủ công (case Postman collection không cover tự động vì cần 2 request cùng lúc hoặc user thứ 2):
| Case | Lệnh | Kết quả |
|---|---|---|
| BR-002 (2 OPEN cùng asset) | POST borrow-positions 2 lần, asset trùng, key khác | 409 đúng message, không tạo record thứ 2 |
| Idempotency replay thật (COND-002) | POST borrow-positions 2 lần CÙNG key, body KHÁC hẳn | Trả lại đúng bản ghi lần 1 (id/asset/quantity không đổi), DB xác nhận chỉ 1 row — không bị "ghi đè" theo body thứ 2 |
| Concurrency/optimistic lock (COND-003) | 2 request `repay` gửi đồng thời (`&` + `wait`) cùng 1 position, amount 30 và 40 trên liability=100 | 1 request thành công (liability→70, version 0→1), request kia nhận **409 CONCURRENT_MODIFICATION** ngay lập tức — xác nhận không có lost-update (nếu lỗi, liability lẽ ra thành 30 do ghi đè, không phải 70) |
| AC-009 (chặn SOL) | POST allocation-lots `asset:"SOL"` | 400 Bad Request ở tầng DTO/enum, class-validator liệt kê đúng `BTC, ETH` |
| AC-004 (mixed-source qua raw API, bypass UI) | POST allocation-lots `fundingSource:"PERSONAL"` + `fundingBorrowPositionId` set | 422 đúng message "chỉ được gắn với đúng 1 nguồn vốn" (xác nhận lần 1 bị "pass" sai do lỗi thao tác test — biến shell không giữ qua 2 lệnh Bash riêng biệt gửi `fundingBorrowPositionId=""`; chạy lại đúng trong cùng 1 shell cho kết quả đúng 422) |
| AC-010/IDOR | User B gọi GET position của User A | 404, không phân biệt not-found/not-owned |

## Đối chiếu Acceptance Criteria
| AC | Trạng thái | Bằng chứng |
|---|---|---|
| AC-001 | PASS | unit + newman thật (tạo position OPEN) |
| AC-002 (BR-002) | PASS | unit + curl thật (409, message đúng) |
| AC-003 | PASS | unit + newman thật (tạo lot funded từ position) |
| AC-004 (BR-003, mixed-source) | PASS | unit + curl thật (422) — xem ghi chú false-negative lần đầu ở bảng trên |
| AC-005 (BR-005, reserve) | PASS | unit + newman thật: `reservedAmountUsdt` tăng đúng 3500 sau sell lot |
| AC-006 (BR-006, repay) | PASS | unit + newman thật: overpayment 422, full repay → REPAID + reservedAmountUsdt=0; **regression test riêng cho bug code-review (idempotency key reuse trong RepayForm)** — `RepayForm.test.tsx` |
| AC-007 (reconcile) | PASS | unit (MATCHED/DRIFT_DETECTED/RECONCILE_UNKNOWN); newman thật xác nhận RECONCILE_UNKNOWN khi chưa có Binance connection verified (chưa có evidence case DRIFT_DETECTED thật với Binance account thật — xem Defects/warnings) |
| AC-008 (correction) | PASS | unit + newman thật: event CORRECTION mới tạo, event gốc giữ nguyên |
| AC-009 (chặn SOL) | PASS | curl thật (400, enum chặn ở DTO) |
| AC-010 (ownership/IDOR) | PASS | unit + curl thật (404 cho user khác) |
| AC-011 (dust-on-repay) | PASS (nhánh ngưỡng=0 mặc định) | unit — chưa có evidence thật với ngưỡng khác 0 vì COND-001b giữ mặc định 0 (chủ ý, xem decision.json) |
| BR-009 (DRIFT_DETECTED khoá hành động) | PASS | unit (sellLot, repay, createAllocationLot đều test riêng, bao gồm finding từ code review) — chưa có evidence end-to-end thật với Binance account thật tạo ra drift thật (xem Defects/warnings) |
| COND-002 (idempotency) | PASS | curl thật: replay cùng key, body khác → không double-create, không ghi đè theo body mới |
| COND-003 (optimistic lock) | PASS | curl thật: 2 request đồng thời, 1 thành công 1 conflict, không lost-update |
| COND-004/OQ-P05 (manual-only cho fee/dust/overpayment/external) | PASS | unit + newman: overpayment trả 422 rõ ràng, không tự động tính |

## Required suites
- **Calculation/rounding**: Decimal end-to-end (Prisma.Decimal, không float) — xác nhận qua unit test và response thật (`"100"`, `"3500.00"` dạng string). PASS.
- **Cap và ngưỡng (ở đây là "exact-match dust threshold" thay vì 2× rule — feature này không có 2× rule, đó là feature "cảnh báo x2" đang chờ sau)**: COND-001b mặc định 0, chưa test thật với liability lệch do interest tích luỹ (N/A ở MVP — chưa có cơ chế tích luỹ interest tự động, liability chỉ đổi qua REPAY do user nhập). PASS với rationale N/A cho sub-case interest-drift.
- **Confirmation absence/expiry/replay**: không áp dụng — feature không có financial execution/preview-confirm với Binance (ghi nhận nội bộ only). N/A, đã ghi rõ trong requirement.
- **READ_ONLY/PAPER/LIVE isolation**: N/A — feature áp dụng như nhau mọi mode (không execute).
- **Source mixing**: PASS (AC-004 ở trên, cả server-side guard và UI không cho chọn 2 nguồn).
- **Reserved proceeds**: PASS (AC-005/AC-006 ở trên).
- **Partial fills/repay**: PASS — unit + curl thật (repay một phần giữ OPEN, liability giảm đúng; sell lot một phần giữ `remainingQuantity` đúng).
- **Stale data**: PASS — `available-capital`/`reconcile` không cache, mỗi lần gọi query DB tươi; UI hiển thị `asOf`.
- **Timeouts**: PASS — unit test `reconcile` khi `getAccountSnapshot` throw → `RECONCILE_UNKNOWN`, không đổi status (không map thành thất bại/thành công).
- **Duplicates**: PASS (COND-002 ở trên, cả unit lẫn curl thật).
- **Races**: PASS (COND-003 ở trên, curl thật với 2 request đồng thời thật, không chỉ mock).
- **Reconciliation và crash recovery**: Reconciliation PASS (unit + curl). Crash recovery (giữa lúc `$transaction` chưa commit) **NOT_RUN** — không có cách mô phỏng crash giữa transaction trong môi trường test hiện tại; rủi ro thấp vì Postgres transaction tự rollback khi connection chết giữa chừng (ACID), nhưng chưa có bằng chứng thực nghiệm riêng cho feature này.

## Defects / warnings
- **WARNING-001** (đã fix, không còn ảnh hưởng tới bản được APPROVE) — ghi lại để có 1 nơi tổng hợp: 2 finding từ `/code-review` (RepayForm idempotency-key reuse; createAllocationLot 422 thay vì 409 cho DRIFT_DETECTED) đã fix trước khi vào QA, xem `review.md`/`implementation.md`. Không lặp lại ở QA.
- **WARNING-002** (chưa fix, chấp nhận được cho MVP) — BR-009 (DRIFT_DETECTED) và AC-007 (reconcile phát hiện lệch) chưa có evidence end-to-end với 1 Binance account thật tạo ra tình huống lệch thật (chỉ có unit test mock response Binance). Risk: hành vi thật của Binance khi trả về field `borrowed`/`interest` có thể khác giả định (tương tự RISK-001 đã ghi nhận ở `binance-read-only-connection`, nay kế thừa sang reconciliation của feature này). Owner: user/QA, nên làm 1 lần manual smoke test với Binance account thật trước khi coi DONE hoàn toàn — không chặn QA PASS_WITH_WARNINGS vì logic nội bộ (phía ledger) đã test đầy đủ, phần chưa chắc chắn là dữ liệu Binance trả về đúng field gì.
- **WARNING-003** (chưa fix, UX staleness, không phải tài chính) — đã ghi ở `implementation.md`: tạo 1 Allocation Lot funded từ Borrow Position qua form ở trang chính không tự động refresh danh sách lot hiển thị trong `BorrowPositionCard` tương ứng ngay lập tức (cần tải lại trang). Dữ liệu DB đúng ngay; chỉ là UI chưa đồng bộ tức thời.
- **WARNING-004** (NOT_RUN, môi trường giới hạn) — chưa test UI bằng trình duyệt thật (Chrome/Firefox) vì môi trường thực thi không có công cụ browser automation. Testing Library (jsdom) đã mô phỏng tương tác người dùng thật (type/click) cho 4 kịch bản chính + 1 regression, nhưng không thay thế được việc nhìn UI thật (CSS layout, focus visual, trải nghiệm thật). Khuyến nghị: user/QA mở `npm run dev` và thử tay ít nhất luồng chính (tạo khoản vay → mua lot → bán lot → trả nợ) trước khi dùng thật.
- Không có defect CRITICAL/HIGH. Không có finding nào che giấu vấn đề tài chính/bảo mật.

## Verdict
Tất cả required test case có thể chạy được trong môi trường hiện tại đều **PASS**, kể cả các case nhạy cảm nhất (concurrency thật, idempotency replay thật với body khác, IDOR, mixed-source). 2 mục NOT_RUN (crash recovery giữa transaction, Binance drift thật) và 1 mục browser thật (WARNING-004) là giới hạn môi trường/dữ liệu, không phải lỗi phát hiện được rồi bỏ qua — đã ghi rõ residual risk và owner cho từng mục, không che giấu correctness tài chính/bảo mật nào.

**Đề xuất qa_status: PASS_WITH_WARNINGS** (WARNING-002, WARNING-003, WARNING-004 cần user/product owner xác nhận chấp nhận trước khi coi feature DONE, theo đúng Definition of Done trong `workflows/feature-development.md`).
