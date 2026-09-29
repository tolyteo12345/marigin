# Risk rules và acceptance boundaries

## R1 — Borrow cap
Tổng initial borrow exposure không vượt verified USDT collateral / 3. Với collateral hợp lệ 30,000 USDT, cap = 10,000 USDT. Bằng cap được phép qua riêng gate này; lớn hơn phải reject.

USDT balance ≠ collateral value ≠ available balance ≠ borrow capacity. Định nghĩa collateral, account scope (cross/isolated và biến thể), haircuts và valuation phải NEEDS_VERIFICATION cho tới khi BA có bằng chứng. Collateral giảm, repay một phần, vay thêm và nhiều account là OPEN_QUESTION; không tự chọn policy. Binance maximum borrow là ràng buộc bổ sung, không thay cap của sản phẩm.

Architecture phải serialize/atomically reserve exposure cho intents đồng thời; tính cả pending/unknown borrow để không vượt cap. Preview không giữ quyền vay vô hạn. Trước submit phải revalidate dữ liệu, policy, balance/exposure và confirmation còn hợp lệ; thay đổi material phải preview/confirm lại. Stale/unknown input chặn hành động tăng rủi ro; xử lý hành động giảm rủi ro cần policy BA riêng.

## R2 — 2× first entry
current_price >= first_borrow_entry_price × 2 kích hoạt CRITICAL_REPAY_REQUIRED. Test dưới, bằng và trên boundary. Entry immutable; additional borrow không reset. Alert mạnh, hiển thị principal/interest/liability, dự toán USDT buyback và repay plan. Không đặt lệnh tự động. Price feed, freshness, latching/clear behavior và position close semantics chưa chốt phải OPEN_QUESTION.

## R3 — Sell funded BTC/ETH → repay
Ngay khi fill bán BTC/ETH có nguồn vay được ghi nhận, proceeds tương ứng được reserve cho liability liên quan. UI hướng tới BUY borrowed asset → REPAY, mỗi bước confirm riêng. Không dùng proceeds này cho khoản vay/đầu tư khác trước khi nghĩa vụ được xử lý theo policy đã duyệt. Không coi UI redirect là enforcement: backend/ledger phải enforce.

Partial sale/fill, fee asset khác, multiple funding sources, shortfall, repay fail/timeout đều giữ trace và reservation đúng phần. Policy release surplus sau xác nhận settlement phải được BA duyệt; không tự giải phóng sau order accepted. Phạm vi áp dụng SOL là OPEN_QUESTION, không được ngầm cho phép bypass.

## Confirmation, modes và audit
READ_ONLY không submit writes. PAPER_TRADING không gọi live mutation endpoints, dùng ledger/environment riêng. LIVE cần bật explicit và authorization/confirmation cho từng action. Confirmation phải gắn action, asset, quantity, account, mode, preview version, price/slippage constraints và expiry; không tái sử dụng confirmation hoặc tự tăng amount. Backend kiểm tra chứ không chỉ ẩn nút UI.

Mỗi attempt ghi intent ID, actor, timestamp, mode, snapshot/policy version, confirmation reference, request correlation, result/unknown state và ledger effects; redact credentials. Replay/double click không tạo thêm giao dịch. Restart không làm mất pending intents. Risk alerts không được biến thành execution jobs.

## Required QA
Cap boundary + concurrent requests; 2× boundary; no confirmation/replay/expired preview; mode isolation; partial fill; unknown outcome; duplicate/out-of-order events; stale data; sell proceeds reservation; mixed-source sale; interest accrual; rounding/dust; external manual activity và reconciliation drift. Automated tests chỉ mocks/simulator/verified safe test environment, tuyệt đối không live trades.
