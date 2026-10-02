# Architecture: capital-provenance-ledger

Owner: architect-agent | Requirement revision: r1-2026-10-01 (sha256:429b97a572705c75a7570e44054961ab5b8841cd554bc884e8e64760c07db5e6)
BA revision: sha256:7d0ee4a50751a9a0ef4453b7a048039404c4bab3f18e99ed0e99264750d224d2
Decision: features/capital-provenance-ledger/decision.json

## Gate check và scope
BA status: APPROVED_WITH_CONDITIONS (COND-001..COND-004, due tại gate này). Không còn blocker nghiệp vụ mới; 4 quyết định MVP-scoping (mixed-source chặn, reserve 100% tới REPAID, chỉ BTC/ETH, 1 Borrow Position/asset) giữ nguyên như requirement/BA đã chốt, kiến trúc không mở rộng thêm.

**Gap phát hiện khi thiết kế, chưa có trong requirement/BA**: user đã chốt ngưỡng dust/drift = **0.01 USDT** (COND-001) cho "cả BR-009 và AC-011", nhưng `liability`/`borrowed asset outstanding` (BR-009) và liability còn lại khi REPAY (AC-011 đề xuất) có đơn vị là **borrowed asset gốc** (ví dụ ZEC, WLD), không phải USDT (docs/DOMAIN.md: "Liability:... có units của borrowed asset"). Áp trực tiếp "0.01 USDT" vào một đại lượng đo bằng ZEC là sai đơn vị. Kiến trúc **không tự quy đổi** bằng giá thị trường (chưa có Market Data feature, và quy đổi dust bằng giá hiện tại tạo phụ thuộc vòng không cần thiết). Xử lý: dùng 0.01 USDT đúng nghĩa ở nơi đại lượng đã là USDT (không có trường hợp nào trong MVP cần dust-compare 2 số USDT — proceeds/reserved là phép cộng chính xác, không có sai số tích luỹ); với BR-009/AC-011 (native units), MVP dùng **ngưỡng mặc định = 0 (exact match)**, tức bất kỳ chênh lệch nào cũng là `DRIFT_DETECTED`/chặn tự động đóng REPAID — an toàn hơn là đoán một epsilon theo native unit. Ghi là **COND-001b**, chưa RESOLVED, không chặn ARCHITECTURE READY (threshold là hằng số cấu hình, đổi được không cần đổi schema) nhưng BA+user cần xác nhận trước IMPLEMENTATION nếu 0 làm phát sinh quá nhiều false positive do interest tiếp tục tích luỹ giữa thời điểm ledger ghi nhận và thời điểm đọc Binance.

## Components và dependency contracts
Tái dùng stack đã chốt: NestJS (TypeScript) + PostgreSQL/Prisma (lý do Decimal-safe đã lập luận ở `architecture/binance-read-only-connection.md`, không lặp lại).

| Module | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `LedgerModule` | CRUD Borrow Position, Allocation Lot; validate business rules (BR-002, BR-003, BR-004) trước khi ghi event | PrismaModule, AuthContextModule (đã có từ `user-authentication`) |
| `LedgerEventModule` | Ghi append-only event (`ASSET_SOLD`, `ASSET_BOUGHT`, `LOT_SOLD`, `REPAY`, `CORRECTION`), tính lại `reservedAmount`/`remainingQuantity` trong cùng transaction | PrismaModule, LedgerModule |
| `ReconciliationModule` | So sánh `BorrowPosition.liabilityLedger` với liability đọc từ Binance; đánh dấu `DRIFT_DETECTED` | `BinanceReadOnlyAdapterModule` (feature `binance-read-only-connection`, chỉ gọi lại interface đã có, KHÔNG thêm endpoint Binance mới) |
| `AvailableCapitalModule` | Tính read-model "free capital" = vốn cá nhân xác định − tổng `reservedAmount` đang giữ | LedgerModule |
| Frontend `LedgerFeature` (React) | Form ghi nhận từng loại event, dashboard Borrow Position (liability/reserved/status), banner drift/unclassified | REST API qua session+CSRF, tái dùng pattern `binance-read-only-connection` |

Ranh giới quan trọng: `ReconciliationModule` KHÔNG tự gọi Binance trực tiếp — chỉ dùng lại service đã export từ `binance-read-only-connection` (đọc liability/borrowed asset của connection thuộc user), tránh trùng lặp logic gọi Binance ở 2 nơi (khớp "reuse code đã có trong codebase" thay vì viết lại).

## Domain / storage / ledger
```prisma
enum BorrowPositionStatus {
  OPEN
  REPAID
  DRIFT_DETECTED
}

enum AllocationAsset {
  BTC
  ETH
}

enum AllocationFundingSource {
  PERSONAL
  BORROW
}

enum LedgerEventType {
  BORROW_OPENED
  ASSET_SOLD
  ASSET_BOUGHT
  LOT_SOLD
  REPAY
  CORRECTION
  DUST_WRITTEN_OFF   // AC-011, ghi rõ phần dust bị bỏ qua khi đóng REPAID
}

model BorrowPosition {
  id                   String               @id @default(uuid())
  userId               String
  borrowedAsset        String               // free-form, ví dụ "ZEC", "WLD" — không enum vì danh sách mở
  quantity             Decimal              @db.Decimal(36, 18)
  firstBorrowEntryPrice Decimal             @db.Decimal(36, 18) // immutable — không có field update sau khi set (BR: chỉ ghi lúc tạo)
  liabilityLedger      Decimal              @db.Decimal(36, 18) // principal+interest, đơn vị borrowedAsset, cập nhật qua REPAY event
  liabilityBinanceLast Decimal?             @db.Decimal(36, 18) // snapshot lần reconcile gần nhất, chỉ để hiển thị/so sánh, KHÔNG dùng để tính available capital
  reservedAmountUsdt   Decimal              @default(0) @db.Decimal(36, 2)
  status               BorrowPositionStatus @default(OPEN)
  version              Int                  @default(0) // optimistic lock (COND-003)
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
  repaidAt             DateTime?

  @@index([userId])
  @@index([userId, borrowedAsset])
}
-- Partial unique index (BR-002), Prisma schema không khai báo được WHERE nên thêm bằng migration SQL thủ công:
-- CREATE UNIQUE INDEX "BorrowPosition_user_asset_open_unique" ON "BorrowPosition" ("userId", "borrowedAsset") WHERE "status" = 'OPEN';

model AllocationLot {
  id                   String                  @id @default(uuid())
  userId               String
  asset                AllocationAsset         // chỉ BTC | ETH — enum tự chặn SOL ở tầng DB (AC-009)
  quantity             Decimal                 @db.Decimal(36, 18) // quantity gốc khi mua
  remainingQuantity    Decimal                 @db.Decimal(36, 18) // giảm dần khi LOT_SOLD
  costBasisUsdt        Decimal                 @db.Decimal(36, 2)
  fundingSource        AllocationFundingSource
  fundingBorrowPositionId String?              // bắt buộc non-null khi fundingSource=BORROW (app-level check, BR-003)
  fundingBorrowPosition BorrowPosition?        @relation(fields: [fundingBorrowPositionId], references: [id])
  version              Int                     @default(0)
  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @updatedAt

  @@index([userId])
  @@index([fundingBorrowPositionId])
}

model LedgerEvent {
  id                 String          @id @default(uuid())
  userId             String
  type               LedgerEventType
  borrowPositionId   String?
  allocationLotId    String?
  payload            Json            // số liệu gốc user nhập (proceeds, fee, quantity...), đơn vị ghi rõ trong payload
  correctsEventId    String?         // tự tham chiếu — non-null khi type=CORRECTION (BR-008)
  idempotencyKey     String          // COND-002
  createdAt          DateTime        @default(now())

  @@unique([userId, idempotencyKey])
  @@index([userId])
  @@index([borrowPositionId])
  @@index([allocationLotId])
}
```
Append-only: `LedgerEvent` không có update/delete path ở tầng service (chỉ `create`). Sửa sai → tạo event `CORRECTION` mới với `correctsEventId` trỏ về event gốc; `BorrowPosition`/`AllocationLot` là state hiện tại được **derive lại** bằng cách replay toàn bộ event khi cần audit, nhưng để tránh tính lại mỗi request, các cột `liabilityLedger`/`reservedAmountUsdt`/`remainingQuantity` là **cache đã tính**, cập nhật atomically cùng transaction ghi event (không bao giờ update các cột này ngoài transaction ghi event tương ứng) — khớp docs/CAPITAL_PROVENANCE.md "Ghi fill + allocation + reservation atomically".

## API contracts và state machines
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/ledger/borrow-positions` | Body `{borrowedAsset, quantity, firstBorrowEntryPrice}` + header `Idempotency-Key`. 409 nếu đã có OPEN cùng asset (BR-002, vi phạm partial unique index) |
| GET | `/api/ledger/borrow-positions` | List của user, kèm `reservedAmountUsdt`, `status` |
| POST | `/api/ledger/borrow-positions/:id/sell-asset` | Event `ASSET_SOLD` `{quantitySold, proceedsUsdt}` — chỉ cho phép khi status=OPEN |
| POST | `/api/ledger/allocation-lots` | Event `ASSET_BOUGHT` `{asset, quantity, costBasisUsdt, fundingSource, fundingBorrowPositionId?}`. 422 nếu `fundingSource=BORROW` mà thiếu `fundingBorrowPositionId`, hoặc position đó không OPEN/không thuộc user |
| POST | `/api/ledger/allocation-lots/:id/sell` | Event `LOT_SOLD` `{quantitySold, proceedsUsdt}`. 422 nếu `quantitySold > remainingQuantity`. Nếu lot funded từ Borrow Position: cộng `proceedsUsdt` vào `reservedAmountUsdt` của position đó trong cùng transaction (BR-005) |
| POST | `/api/ledger/borrow-positions/:id/repay` | Event `REPAY` `{amount}` (đơn vị borrowedAsset). Nếu `amount > liabilityLedger` (overpayment): 422, yêu cầu user xác nhận riêng (Edge case, OQ-P05/COND-004) thay vì tự trừ. Nếu `liabilityLedger - amount` nằm trong ngưỡng dust (COND-001b, mặc định 0): status → REPAID, ghi kèm event `DUST_WRITTEN_OFF` nếu còn dư khác 0 tuyệt đối nhỏ, và release toàn bộ `reservedAmountUsdt` thành free capital (BR-006) |
| POST | `/api/ledger/borrow-positions/:id/reconcile` | Gọi `BinanceReadOnlyAdapterModule` lấy liability/borrowed asset hiện tại; so sánh với `liabilityLedger`. Lệch ≠ 0 (COND-001b) → status=`DRIFT_DETECTED`, lưu `liabilityBinanceLast`. Timeout/lỗi đọc Binance → trả `RECONCILE_UNKNOWN`, **không** đổi status (AGENTS.md: timeout ≠ thất bại) |
| POST | `/api/ledger/events/:id/correct` | Tạo event `CORRECTION` tham chiếu event gốc; áp dụng lại ảnh hưởng (ví dụ sửa proceedsUsdt của 1 `LOT_SOLD` cũ → điều chỉnh `reservedAmountUsdt` theo delta, không ghi đè) |
| GET | `/api/ledger/available-capital` | `{freeCapitalUsdt, totalReservedUsdt, asOf}` — không cache, tính trực tiếp từ DB mỗi lần gọi |

State machine `BorrowPositionStatus`:
```
(không có)  --(POST borrow-positions, không có OPEN cùng asset)--> OPEN
OPEN        --(REPAY đưa liability về ≤ ngưỡng dust)--> REPAID            [terminal, reservedAmountUsdt released về 0]
OPEN        --(reconcile phát hiện lệch)--> DRIFT_DETECTED
DRIFT_DETECTED --(user xác nhận đã xử lý, correction event ghi rõ)--> OPEN
```
Khi `DRIFT_DETECTED`: `sell-asset`, `allocation-lots` (dùng position này làm nguồn), `repay` cho position đó đều trả 409 (BR-009 "chặn hành động phụ thuộc cho tới reconcile"). `reconcile` và `correct` vẫn cho phép.

`AllocationLot` không có status enum riêng (MVP không cần) — suy ra từ `remainingQuantity`: `0` = fully disposed, `>0 và < quantity` = partially disposed, `= quantity` = chưa bán.

## Financial formulas
- `reservedAmountUsdt += proceedsUsdt` mỗi `LOT_SOLD` của lot funded từ Borrow Position (BR-005) — phép cộng trực tiếp, không công thức phái sinh, không nhân với giá hiện tại (tránh double-use giá chưa có nguồn verify).
- `freeCapitalUsdt` (AvailableCapitalModule) = `personalCapitalUsdt` (MVP: user tự khai báo tổng vốn cá nhân xác định — chưa có nguồn tự động nào khác trong scope hiện tại, ghi rõ là input thủ công, không suy luận từ balance Binance theo đúng AGENTS.md "Không suy provenance từ balance") − `SUM(reservedAmountUsdt WHERE status IN (OPEN, DRIFT_DETECTED))`.
- Không có công thức PnL/repay-opportunity trong feature này (thuộc Profit & Repay Calculator, dùng `firstBorrowEntryPrice`/`liabilityLedger` ledger này expose làm input qua GET endpoints).

## Concurrency / idempotency
- **COND-002 (idempotency)**: mọi POST ghi event bắt buộc header `Idempotency-Key` (client-generated UUID). `LedgerEvent` có `@@unique([userId, idempotencyKey])`; service `upsert`-style: nếu key đã tồn tại, trả lại kết quả event đã ghi trước đó (không ghi trùng, không báo lỗi) — chống double-submit do double-click/retry mạng.
- **COND-003 (concurrency)**: mọi mutation trên `BorrowPosition`/`AllocationLot` dùng optimistic lock: `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2` trong cùng transaction Prisma (`prisma.$transaction`) với insert `LedgerEvent`. 0 row affected → 409 `CONCURRENT_MODIFICATION`, client phải GET lại state mới nhất rồi thử lại (không tự động retry ngầm, khớp pattern không retry âm thầm đã dùng ở `binance-read-only-connection`).
- Race "2 request cùng ghi `LOT_SOLD` cho cùng lot vượt `remainingQuantity`": optimistic lock + check `quantitySold <= remainingQuantity` trong cùng transaction trước khi commit đảm bảo không có 2 lần trừ chồng nhau thành âm.
- Reconciliation và mutation khác trên cùng Borrow Position: `reconcile` cũng tham gia optimistic lock (đọc `version` trước, ghi `DRIFT_DETECTED` kèm `version+1`); nếu có mutation khác xen giữa, reconcile fail với 409, client gọi lại — tránh reconcile dựa trên state đã stale.

## User confirmation / modes / security / audit
- Không có mode LIVE/PAPER_TRADING phân biệt (feature không gọi Binance write) — áp dụng mọi mode như nhau, khớp requirement.
- Mỗi form ghi event (đặc biệt `LOT_SOLD`, `REPAY`) có bước confirm UI trước submit (không phải financial execution confirm, mà "xác nhận số liệu đúng trước khi ghi append-only" — vì sửa sai phải qua correction, không phải sửa nhanh).
- Ownership: toàn bộ entity filter theo `userId = req.user.id` (tái dùng `AuthContextModule` từ `user-authentication`), 404 (không phân biệt not-found vs not-owned) theo pattern AC-010/AC-006 đã áp dụng ở feature trước.
- Audit: mỗi `LedgerEvent` tự nó là audit trail (append-only, có `createdAt`, `userId`, `payload`) — không cần bảng `AuditLog` riêng như 2 feature trước vì bản chất ledger này đã là nhật ký; `CORRECTION` event giữ nguyên event gốc, không xoá.
- Không log secret (feature này không chạm API key Binance trực tiếp, chỉ gọi lại adapter đã có).

## UI handoff
- `BorrowPositionList`: card mỗi position — `borrowedAsset`, `quantity`, `firstBorrowEntryPrice`, `liabilityLedger`, `reservedAmountUsdt`, `status` (badge, riêng màu cảnh báo cho `DRIFT_DETECTED`).
- `RecordEventForms`: 5 form tương ứng 5 event type, mỗi form hiển thị rõ đơn vị (USDT vs native asset) để tránh nhầm; form `ASSET_BOUGHT` bắt buộc chọn `fundingSource`, nếu `BORROW` thì dropdown chỉ liệt kê Borrow Position đang OPEN của user.
- `DriftBanner`: khi có position `DRIFT_DETECTED`, hiển thị song song `liabilityLedger` vs `liabilityBinanceLast` kèm thời điểm reconcile, nút "tôi đã xử lý" dẫn tới form correction.
- `AvailableCapitalWidget`: hiển thị `freeCapitalUsdt`, `totalReservedUsdt`, `asOf` — luôn kèm timestamp, không cache ngầm (khớp pattern `binance-read-only-connection`).
- Case OQ-P05/COND-004 (fee token khác, overpayment, external transfer): UI không có luồng tự động; chỉ có nút "ghi nhận thủ công qua correction event" kèm text giải thích đây là giới hạn MVP.

## Validation và rollout
| AC | Component | Test plan |
|---|---|---|
| AC-001/AC-002 | LedgerModule + partial unique index | Test tạo 2 position cùng asset khi 1 OPEN → 409; test sửa `firstBorrowEntryPrice` sau tạo → không có endpoint update, test đảm bảo field immutable bằng cách không expose PATCH |
| AC-003/AC-004 | LedgerModule validate fundingSource | Test lot BORROW thiếu `fundingBorrowPositionId` → 422; test cố gửi 2 nguồn cùng lúc (payload mở rộng) → 422 |
| AC-005/AC-006 | LedgerEventModule.sellLot transaction | Test cộng đúng `reservedAmountUsdt`; test REPAY cuối → status REPAID + reserved release |
| AC-007 | ReconciliationModule | Test fixture lệch liability → DRIFT_DETECTED, chặn sell-asset/repay mới (409) |
| AC-008 | LedgerEventModule correction | Test correction event không update event gốc, cả 2 tồn tại trong query history |
| AC-009 | Prisma enum `AllocationAsset` | Test gửi asset="SOL" → lỗi validation DTO trước khi chạm DB (enum không chấp nhận) |
| AC-010 | Ownership guard | Test user A truy cập Borrow Position của B → 404 |
| AC-011 (đề xuất BA) | REPAY handler + COND-001b | Test liability còn dư đúng bằng ngưỡng dust (mặc định 0, tức chỉ test exact-zero cho tới khi COND-001b có giá trị khác) |

Rollback: migration Prisma chuẩn; không có LIVE activation (không execute). Trước DONE: cần ít nhất 1 trace test đầy đủ theo docs/CAPITAL_PROVENANCE.md "Bằng chứng cần có" (personal + borrow source, partial sell, sale lỗ, buyback không đủ dữ liệu áp dụng vì không có buyback trong MVP này — ghi rõ không áp dụng, partial repay, duplicate idempotency key, concurrent request, recovery sau crash giữa transaction).

## Open decisions và readiness
- **COND-001b** (mới phát hiện) | Owner: BA + user | Affected gate: IMPLEMENTATION | Ngưỡng dust cho BR-009 (reconciliation)/AC-011 (REPAID dust) phải ở đơn vị borrowed-asset gốc, không phải USDT như COND-001 đã chốt (COND-001 = 0.01 USDT vẫn áp dụng đúng nếu sau này có so sánh 2 số USDT, nhưng MVP hiện không có case đó). Kiến trúc dùng mặc định an toàn = 0 (exact match) cho tới khi có quyết định khác. Không chặn ARCHITECTURE READY vì là hằng số cấu hình.
- COND-002: RESOLVED — idempotency key + unique constraint thiết kế ở trên.
- COND-003: RESOLVED — optimistic lock (`version` column) thiết kế ở trên.
- COND-004: RESOLVED — mọi case OQ-P05 (fee token khác, overpayment, external transfer) đều trả lỗi rõ ràng yêu cầu xử lý qua correction event thủ công, không có tính toán tự động; QA phải verify đúng hành vi chặn này.
- OQ-C01 (ngưỡng BR-009) trùng với COND-001b ở trên — gộp làm một, không tạo 2 open question riêng.

**Đề xuất architecture_status: READY.** Không còn blocker ảnh hưởng thiết kế; COND-001b ảnh hưởng giá trị cấu hình tại IMPLEMENTATION, không ảnh hưởng schema/API/state machine đã thiết kế. Coordinator quyết định có dispatch design-agent (song song, feature có UI) và backend/frontend-agent hay dừng lại để user xác nhận COND-001b trước.
