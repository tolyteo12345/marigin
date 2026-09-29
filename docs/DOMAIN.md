# Domain và phạm vi sản phẩm

## Mục tiêu
Hỗ trợ quyết định vay altcoin để tích lũy BTC/ETH/SOL; không phải trading bot, không cam kết dự đoán đỉnh/đáy hoặc lợi nhuận.

USDT collateral → borrow altcoin → sell altcoin → USDT → buy BTC/ETH/SOL → theo dõi asset và liability → sell tài sản liên quan → buy borrowed coin → repay. Mỗi bước giao dịch có preview và xác nhận riêng; xác nhận một bước không ủy quyền các bước tiếp theo.

## Khái niệm
- Borrow Position: thực thể nội bộ quản lý khoản vay, không chỉ là tập Binance trades.
- first_borrow_entry_price: giá tham chiếu tại lần vay đầu tiên, immutable; nguồn giá và thời điểm phải được BA xác minh. Không reset bằng average entry khi vay thêm.
- Initial exposure: giá trị USDT của principal tại thời điểm vay; khác current liability. Cách cộng khoản vay bổ sung, giải phóng exposure khi repay một phần và xử lý phí là OPEN_QUESTION.
- Liability: principal còn nợ + interest còn nợ, có units của borrowed asset và timestamp. Không cộng interest lần nữa nếu exchange field đã bao gồm.
- Capital allocation/lot: asset, quantity, cost, funding source, parent position và phần đã disposed.
- Reserved proceeds: tiền bán borrow-funded BTC/ETH, gắn với nghĩa vụ repay và bị loại khỏi capital có thể tái sử dụng.
- External/unattributed activity: giao dịch chưa map được nguồn; phải reconcile hoặc yêu cầu phân loại, không mặc định personal capital.

## Position tối thiểu cần được thiết kế sau BA
Borrowed asset/quantity; first entry price; borrow/repay events; interest; proceeds thực tế; allocation BTC/ETH/SOL; holdings/sales; liability snapshot; realized/unrealized PnL; estimated repayment cost; repayment history; provenance links; audit identifiers. Borrow cùng asset có thể bị exchange gộp debt: cần policy phân bổ interest/repay giữa các position, không giả định exchange có position ID nội bộ.

## Repay opportunity
So sánh **net executable liquidation value** của tài sản allocated với **estimated all-in repayment cost**, cùng USDT và snapshot đủ mới. Trừ fees/slippage của bán asset và mua lại coin đúng một lần, gồm interest tới thời điểm dự kiến. Cần account cho restricted proceeds, partial fills, minimum order, dust và liquidity. Không lấy toàn bộ account assets để chứng minh một position có thể repay.

Đây là khung yêu cầu, chưa phải công thức được duyệt. BA phải phân biệt estimated surplus sau đóng vị thế, realized PnL, unrealized PnL, personal capital và dòng tiền đã rút/nạp. Threshold, buffer và valuation policy còn OPEN_QUESTION. Ví dụ 25.1 ZEC × 420 = 10,542 USDT; 14,000 − 10,542 = 3,458 USDT chỉ minh họa trước các chi phí bổ sung, không phải kết quả lợi nhuận bảo đảm.

## Borrow candidates
OvervaluationModel phải explainable, versioned, configurable. Candidate hiển thị score, contributions, reasons, risk, data timestamp, missing inputs, borrow availability và interest. Score không đồng nghĩa xác suất giá giảm hoặc permission to borrow.

Requirement + BA xác định MVP từ market regime, category/narrative/leader, market cap, FDV, supply/unlock, returns 7D/30D/90D so với BTC/ETH/category, RSI, volume, funding, open interest, acceleration, ATH/recent-low distance, liquidity và borrow conditions. Không đơn giản hóa “ngáo giá” thành RSI > X. Version/config/data snapshot phải đủ để tái lập; missing/stale data không được im lặng thành zero.

## Các module dự kiến
| Module | Phụ thuộc cần khảo sát |
|---|---|
| Binance Connection | security, verified account scope |
| Margin Dashboard | connection, reconciled snapshots |
| Borrowable Coin Scanner | connection, market data |
| Market Data | verified sources, freshness |
| Coin Metadata | verified sources |
| Category/Narrative | metadata, taxonomy |
| Overvaluation Scoring Engine | market data, metadata, category, scanner |
| Borrow Position Manager | ledger, connection |
| Capital Provenance Ledger | BA allocation/attribution policies |
| BTC/ETH/SOL Allocation | positions, ledger |
| Risk Engine | collateral semantics, positions, ledger |
| Profit & Repay Calculator | liability, ledger, market data |
| Repayment Manager | calculator, risk, execution |
| Alert Engine | risk, calculator; không execution permission |
| Binance Execution | confirmed intents, risk, ledger, audit, verified adapter |
| Paper Trading | isolated simulator, same domain invariants |
| Audit Log | identity, retention/redaction policy |
| Portfolio Analytics | reconciled ledger, approved PnL definitions |

Module có thể phát triển riêng theo contract và dependency; bảng không phê duyệt triển khai toàn bộ.
