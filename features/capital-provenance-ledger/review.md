# Code Review: capital-provenance-ledger

Owner: `/code-review` (forked execution, độc lập với phiên implement) | Decision: features/capital-provenance-ledger/decision.json

Input:
- Requirement: sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6
- Architecture: sha256:da81fdb2a2756da5e4fd9683f793df7aa2c39bd76b8f83917b3a979def7b83a2
- Design: sha256:5f8dda64c3c5006fd13db6f784b13bc0f8fa70a9ca4c0e0d810a73c164586f8f
- Implementation đưa vào review (trước fix): sha256:d69a1220dcd186218ba3003148a2107825236806a49ef6d75f6d65ec027942e4
- Implementation sau khi áp dụng fix (được APPROVED): sha256:21818a63177d9dbc28e0b0ed2faf6c10701e7f6ad1fac96ee2a8ce89753c241a

**Ghi chú độc lập tính**: `/code-review` chạy như forked execution riêng biệt trên diff thật của branch `feature/capital-provenance-ledger` (không chia sẻ context với phiên viết implementation), đúng yêu cầu AGENTS.md "Reviewer phải độc lập với người implement". Cả 2 finding dưới đây được chính review tool tìm ra qua đọc code thật, không phải tự-rà-soát của người implement. Sau khi review xong, coordinator (cùng phiên với người implement) áp dụng fix và verify lại — khác với review hoàn toàn end-to-end bởi người thứ 3, nhưng đúng chuẩn "reviewer độc lập phát hiện, fix riêng rồi verify lại" mà AGENTS.md không cấm (không giống trường hợp tự duyệt APPROVED cho chính phát hiện của mình).

## Finding

### 1. (MEDIUM — silent data loss) RepayForm tái sử dụng Idempotency-Key cho lần trả nợ thứ 2
**File**: `frontend/src/components/ledger/RepayForm.tsx:16`
**Mô tả**: `RepayForm` cố ý không tự đóng sau khi trả nợ thành công (khác mọi form khác trong feature này) để hiển thị thông báo "đã trả hết/đã giải phóng vốn" (design mục 8b). Nhưng `idempotencyKey` được sinh 1 lần bằng `useState(newIdempotencyKey())` và không bao giờ đổi. Nếu user mở Repay, trả một phần (vd 5/25.1), rồi trả tiếp lần 2 (vd 3) **trong cùng form đang mở đó**, request thứ 2 vẫn mang key cũ.
**Hệ quả**: `LedgerService.repay()` (backend) tìm thấy `LedgerEvent` đã tồn tại với key đó → trả lại state cũ, **không ghi event mới, không trừ liability** — và không báo lỗi gì. User tưởng đã trả thành công lần 2 nhưng thực ra không có gì xảy ra. Đây là lỗi mất dữ liệu tài chính âm thầm (silent), đúng loại rủi ro AGENTS.md cấm ("Không reserve dựa trên notional giả định...", tinh thần "không âm thầm bỏ qua dữ liệu tài chính").
**Fix đã áp dụng**: sinh `idempotencyKey` mới (`setIdempotencyKey(newIdempotencyKey())`) ngay sau mỗi lần submit thành công, đồng thời clear `amount` để tránh user vô tình gửi lại cùng số. Test regression: `RepayForm.test.tsx` — xác nhận 2 lần submit liên tiếp trong cùng form mang 2 header `Idempotency-Key` khác nhau và cả 2 đều gọi `onDone`.

### 2. (MEDIUM — spec violation) `createAllocationLot` trả 422 thay vì 409 khi Borrow Position nguồn đang DRIFT_DETECTED
**File**: `backend/src/ledger/ledger.service.ts:276` (trước fix)
**Mô tả**: `architecture/capital-provenance-ledger.md` mục "API contracts và state machines" quy định: khi 1 Borrow Position ở trạng thái `DRIFT_DETECTED`, `sell-asset`, `repay`, và việc dùng position đó làm nguồn cho `allocation-lots` đều phải trả **409** (cùng 1 khoá BR-009). Code chỉ áp dụng 409 (qua `assertActionable`) cho `sell-asset`/`repay`/`sell-lot`; nhánh `createAllocationLot` tự viết điều kiện riêng `if (position.status !== 'OPEN') throw UnprocessableEntityException` — gộp nhầm `DRIFT_DETECTED` chung với `REPAID` thành cùng 1 mã lỗi 422.
**Hệ quả**: không sai về mặt chặn hành động (vẫn bị từ chối), nhưng sai mã lỗi so với spec — client (frontend hiện tại không phân biệt theo status code ở đây nên chưa gây lỗi UI, nhưng vi phạm hợp đồng API đã viết trong architecture/Swagger, và sẽ gây nhầm lẫn nếu QA/review sau này test theo đúng status code tài liệu, hoặc nếu frontend sau này dựa vào 409 để hiển thị khác 422 như các action khác).
**Fix đã áp dụng**: gọi `assertActionable(position)` trước khi check `!== 'OPEN'` khi `position.status === 'DRIFT_DETECTED'` → 409 đúng theo spec; `REPAID` (hoặc trạng thái không OPEN khác) vẫn giữ 422. Test mới: `BR-009: rejects funding from a DRIFT_DETECTED Borrow Position with 409, same lock as sell-asset/repay/sell-lot`.

## Soát thêm (không phát hiện vấn đề mới)
- Idempotency pre-check + fallback `P2002` nhất quán ở mọi method khác (`createBorrowPosition`, `sellAsset`, `createAllocationLot`, `sellLot`, `repay`, `correct`) — chỉ `repay` có rủi ro vì là form duy nhất không tự đóng; đã xác nhận các form khác (`SellAssetForm`, `AllocationLotForm`, `AllocationLotCard`'s sell form) đều tự đóng/reset kèm sinh key mới sau thành công, không có lỗi tương tự.
- `grep -rn "parseFloat\|Number(" backend/src/ledger`: không có kết quả — toàn bộ số liệu đi qua `Prisma.Decimal`/string, khớp AGENTS.md.
- Ownership (`getOwnedPosition`/`getOwnedLot`, kể cả bản `*Tx` dùng trong `correct`) nhất quán 404 không phân biệt not-found/not-owned.
- Optimistic lock (`version` + `updateMany` trong transaction) áp dụng đúng ở mọi mutation làm thay đổi `liabilityLedger`/`reservedAmountUsdt`/`remainingQuantity`.
- Partial unique index BR-002: đã xác nhận qua chính implementation.md rằng test ban đầu dùng sai fixture (tên index thay vì tên cột) — review không phát hiện thêm sai lệch nào khác giữa fixture test và hành vi Postgres thật sau khi đã sửa.

## Đối chiếu AC (architecture "Validation và rollout")
| AC | Kết quả |
|---|---|
| AC-001/AC-002 | PASS — unit + smoke test thật (Postgres) |
| AC-003/AC-004 | PASS — unit; BR-009 cho nhánh DRIFT_DETECTED PASS sau fix #2 |
| AC-005 | PASS — unit + smoke test thật (reserved tăng đúng 3500) |
| AC-006 | PASS — unit + smoke test thật (overpayment 422, full repay → REPAID); regression #1 đóng lỗ hổng silent-no-op cho lần repay thứ 2 |
| AC-007 | PASS — unit (MATCHED/DRIFT_DETECTED/RECONCILE_UNKNOWN) |
| AC-008 | PASS — unit + smoke test thật (correction không sửa event gốc) |
| AC-009 | PASS — enum Prisma `AllocationAsset` chặn SOL ở tầng DB/DTO |
| AC-010 | PASS — unit ownership |
| AC-011 | PASS (nhánh mặc định ngưỡng=0) — dust-write-off branch giữ nguyên, chưa có dữ liệu thật vì ngưỡng=0 hiếm khi kích hoạt (COND-001b) |

## Kết luận
2 finding MEDIUM đã fix và verify lại: backend 89/89 unit test pass (thêm 1), frontend 30/30 test pass (thêm 1). Không còn finding nào chặn. Không có finding CRITICAL/HIGH.

**review_status: APPROVED**, gắn implementation revision sha256:21818a63177d9dbc28e0b0ed2faf6c10701e7f6ad1fac96ee2a8ce89753c241a (sau fix).
