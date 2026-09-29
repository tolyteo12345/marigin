# Capital provenance / internal ledger

## Hợp đồng nghiệp vụ
Trace end-to-end: borrow → sell → USDT → BTC/ETH/SOL → sell → USDT → buyback → repay. Exchange balance là dữ liệu đối soát, không phải bằng chứng nguồn vốn.

Ví dụ ZEC proceeds 10,000 USDT → BTC lot cost 6,000 và ETH lot cost 4,000: cả hai lot liên kết Borrow Position ZEC. Bán BTC lot phải reserve proceeds thực nhận của phần funded đó cho ZEC. Phí và partial fills phải map được; không reserve dựa trên notional giả định khi fill khác preview.

## Quyết định bắt buộc trước thiết kế ledger hoàn chỉnh
| ID | Câu hỏi | Owner | Gate bị chặn |
|---|---|---|---|
| OQ-P01 | BTC mixed personal/ZEC/WLD bán một phần: FIFO, LIFO, pro-rata hay user chọn lot? | Product + BA + user | mixed-source disposal |
| OQ-P02 | Reserve toàn bộ proceeds funded hay liability cap; surplus release lúc nào? | Product + BA + user | proceeds release |
| OQ-P03 | SOL có cùng repayment invariant không? | Product + BA + user | borrow-funded SOL disposal |
| OQ-P04 | Phân bổ interest/repay khi exchange gộp nhiều khoản nợ cùng asset? | BA + user | liability attribution |
| OQ-P05 | Fee, dust, partial repay, debt shortfall và external transfer xử lý thế nào? | BA + user | settlement |

Không có policy mặc định. Ví dụ BTC personal 5,000 + ZEC 10,000 + WLD 4,000, bán 6,000 chưa đủ dữ kiện để biết liability nào nhận proceeds. Ghi OPEN_QUESTION và BLOCKED cho feature phụ thuộc, không phân bổ tùy ý.

## Yêu cầu với kiến trúc tương lai
Ledger phải trace source/destination, asset units, decimal quantity, cost basis, position/lot IDs, exchange order/trade/borrow/repay IDs nếu có, event time/ingestion time, mode và reconciliation status. Chọn accounting schema sau BA; không biến mô tả này thành DB schema đã duyệt.

Append-only financial events; sửa bằng correction/reversal có audit, không sửa lịch sử âm thầm. Conservation theo từng asset và fee/dust accounts; transfers không tạo PnL. Không cộng các units khác nhau để “balance” ledger. Event uniqueness chống double counting; reconcile out-of-order/duplicate events và crash recovery. Ghi fill + allocation + reservation atomically hoặc có cơ chế recover bảo toàn invariant.

Available strategy capital phải trừ reserved/committed/unattributed funds theo policy đã duyệt. Không giải phóng reserved khi buyback/repay mới submitted hoặc timeout. Actual settled quantities là căn cứ. External Binance trades có thể xảy ra ngoài app: app không thể cấm hành động ngoài app; phải phát hiện drift, quarantine phần chưa phân loại và chặn hành động phụ thuộc cho tới reconcile.

## Bằng chứng cần có
Test event trace của personal + nhiều borrow sources, partial sell/fill, fee token khác, sale lỗ, buyback không đủ, partial repay, external trades/transfers, duplicate events, concurrent spending và recovery. Mỗi phép tính phải có units, rounding và invariant bảo toàn.
