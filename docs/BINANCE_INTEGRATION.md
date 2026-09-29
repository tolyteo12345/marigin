# Binance integration — verification contract

## Trạng thái
**NEEDS_VERIFICATION**. Bộ scaffold này chưa nghiên cứu/kiểm chứng endpoint hoặc account behavior hiện hành. Không có endpoint nào được coi là approved từ tài liệu này. BA phải đọc tài liệu Binance chính thức mới nhất và lưu URL trực tiếp, section, ngày kiểm tra, account mode/region và evidence trước khi thiết kế dependent behavior.

## Verification matrix
| Capability | Cần xác minh | Status |
|---|---|---|
| Margin account/balance | cross/isolated, permissions, regional/account eligibility, units | NEEDS_VERIFICATION |
| Collateral/available/borrow capacity | field semantics, haircuts, USDT scope, valuation | NEEDS_VERIFICATION |
| Borrowable/max borrow | eligibility, changing limits, inventory, freshness | NEEDS_VERIFICATION |
| Borrow/repay | explicit operation, request/result IDs, partial repayment, debt aggregation | NEEDS_VERIFICATION |
| Interest | accrued vs outstanding, accrual schedule, history, precision | NEEDS_VERIFICATION |
| Margin level | formula, thresholds, liquidation semantics | NEEDS_VERIFICATION |
| Ticker/market data | source, timestamps, stale detection, liquidity | NEEDS_VERIFICATION |
| Orders/status/trades | filters, step sizes, min notional, fills, fee currency, pagination | NEEDS_VERIFICATION |
| Recovery | client IDs, lookup/history, retry semantics, consistency lag | NEEDS_VERIFICATION |
| Transport | signing, clock skew, rate limits, errors, streams/disconnect recovery | NEEDS_VERIFICATION |
| Side effects | auto-borrow/auto-repay flags/defaults; prohibit implicit financial actions | NEEDS_VERIFICATION |
| Test facilities | actual Margin sandbox support; never assume Spot testnet covers Margin | NEEDS_VERIFICATION |

Mỗi dòng verification thực tế cần exact endpoint/method/version, request/response fields, evidence URL/date, limitations, sample redacted fixture, owner và feature impact. Không dùng blog hoặc memory làm bằng chứng duy nhất.

## Adapter requirements cho Architect
Tách read/query, prepare/preview và confirmed execution. Scheduler chỉ đọc/alert/reconcile; không được submit financial mutation. Capability allowlist theo mode; READ_ONLY mặc định và key permissions tối thiểu. LIVE activation không thay từng confirmation.

Idempotency nội bộ không chứng minh exactly-once ở Binance. Dùng exchange identifiers khi được xác minh hỗ trợ; persist intent trước submit. Timeout/disconnect sau submit → UNKNOWN, không retry blind; query exchange state/history, reconcile và chỉ retry theo bằng chứng và policy được duyệt. Nếu không thể xác minh outcome, giữ blocker và hướng user đối soát.

Xử lý partial fills/cancel race, fees, precision/filter rejects, rate limit/backoff, insufficient balance, borrow unavailable và stale snapshot. Không đặt auto-borrow/auto-repay side effect để bỏ qua confirmation của action riêng. User confirm repay không cho phép auto-buy; user confirm buy không cho phép auto-borrow.

Credentials phải encrypted qua secret manager hoặc OS-backed keystore phù hợp stack đã duyệt; tách environments, redact logs, least privilege, không withdrawal permissions nếu không cần. Không đưa secret vào prompts, fixtures hoặc repository.
