# Summary — Agent infrastructure

## Kết quả
Đã tạo infrastructure bằng tài liệu cho 7 agent và quy trình phát triển. Chưa viết application, chưa khởi tạo feature thực tế, chưa kết nối Binance hoặc thực hiện giao dịch. SYSTEM.md là hướng dẫn vai trò để Codex sử dụng, không phải runtime agents đã được cài đặt. Repository ban đầu trống và chưa có Git; không tạo commit.

## Files đã tạo
- `AGENTS.md`
- `agents/architect/SYSTEM.md`
- `agents/ba-feasibility/SYSTEM.md`
- `agents/backend/SYSTEM.md`
- `agents/code-review/SYSTEM.md`
- `agents/frontend/SYSTEM.md`
- `agents/product-requirement/SYSTEM.md`
- `agents/qa/SYSTEM.md`
- `analysis/TEMPLATE-feasibility.md`
- `architecture/TEMPLATE.md`
- `docs/BINANCE_INTEGRATION.md`
- `docs/CAPITAL_PROVENANCE.md`
- `docs/DOMAIN.md`
- `docs/RISK_RULES.md`
- `features/README.md`
- `features/decision.template.json`
- `qa/TEMPLATE.md`
- `requirements/TEMPLATE.md`
- `workflows/feature-development.md`
- `SUMMARY.md`

## Agents
product-requirement-agent chuyển ý tưởng thành requirement; ba-feasibility-agent kiểm chứng khả thi và logic nghiệp vụ; architect-agent thiết kế; backend-agent và frontend-agent triển khai sau authorization/gates; code-review-agent review độc lập và có quyền reject; qa-agent thực thi kiểm thử và trả verdict có evidence.

## Workflow
IDEA → REQUIREMENT → BA FEASIBILITY → ARCHITECTURE → IMPLEMENTATION → CODE REVIEW → QA → DONE.

`features/<feature>/decision.json` là source of truth về trạng thái, khởi tạo từ `features/decision.template.json`. Coordinator là single writer. BA BLOCKED dừng feature; conditional approval có due_gate/evidence; review reject và QA fail quay lại development rồi review/QA lại. Thay đổi inputs invalidate approvals phụ thuộc. DONE cần matching revisions và evidence, không đồng nghĩa bật LIVE.

## Business invariants
- READ_ONLY mặc định; PAPER_TRADING tách biệt; LIVE bật explicit và mỗi financial action vẫn cần user confirmation.
- Tổng initial borrow exposure ≤ verified USDT collateral / 3; chưa biết collateral chính xác thì chặn borrow.
- Giá ≥ 2× first_borrow_entry_price: CRITICAL_REPAY_REQUIRED, alert và repay plan; không tự giao dịch.
- Bán borrow-funded BTC/ETH phải reserve proceeds cho liability liên quan; không tái đầu tư như free capital.
- Internal ledger trace nguồn vốn xuyên suốt; account balance không thay capital provenance.
- Decimal/fixed-point, financial audit, bảo vệ secrets; không live trades trong automated tests.
- Timeout là outcome chưa biết cho tới khi reconcile; chống duplicate và xử lý partial fills.
- Score phải explainable, versioned, configurable; không tự sinh execution permission.

## Open questions cần chốt theo feature
1. Binance account mode/region, USDT collateral semantics, haircuts và borrow capacity thực tế.
2. Initial exposure thay đổi ra sao khi vay thêm/repay một phần/collateral giảm; pending exposure scope.
3. Giá entry/current dùng nguồn nào; alert critical có latch/clear thế nào.
4. Mixed-source disposal: FIFO/LIFO/pro-rata/user-selected lots — chưa chọn.
5. SOL có cùng sell-to-repay invariant với BTC/ETH không.
6. Reserve proceeds, release surplus, shortfall/dust/fees và phân bổ interest/repay giữa nhiều position cùng asset.
7. Công thức PnL/repay opportunity, valuation/slippage buffers và thresholds chính thức.
8. MVP scoring inputs, data sources, missing-data policy và model calibration.
9. Exact Binance endpoints, side effects, idempotency/query capabilities và môi trường test Margin được hỗ trợ.

Các câu hỏi này phải được copy vào decision contract của feature phụ thuộc; chưa có feature thực tế nên chưa tạo contract với trạng thái giả.

## Risks và giới hạn
Liquidation có thể xảy ra trước hoặc ngoài ngưỡng cảnh báo 2×; user confirmation không bảo đảm kịp xử lý. Slippage, interest, borrow availability và dữ liệu stale làm estimate thay đổi. Giao dịch ngoài app có thể gây ledger drift; cần reconcile và quarantine dữ liệu chưa phân loại. Exchange debt aggregation có thể làm attribution khó. Quy trình tài liệu chưa có runner/schema validator tự động enforce gates. Binance behavior hiện là NEEDS_VERIFICATION, không phải đã kiểm chứng.

## Feature nên phát triển đầu tiên
Đề xuất `binance-read-only-connection`: bắt đầu Requirement → BA, xác định account scope/credentials tối thiểu và verified read-only account snapshot, timestamp, errors/redaction, tuyệt đối không execution. Feature này cung cấp evidence cho Margin Dashboard và collateral semantics. Nếu một field chưa verify, loại nó khỏi approved scope một cách rõ ràng hoặc block dependent behavior; không suy đoán. Sau đó ưu tiên requirement/BA cho Capital Provenance Ledger và Risk Engine trước Binance Execution.

Chờ yêu cầu tiếp theo trước khi bắt đầu implementation.

## Kiểm tra scaffold
Kiểm tra đủ 20 file dự kiến, đủ 7 SYSTEM.md, decision template parse được JSON, tất cả stage status bắt đầu NOT_STARTED và implementation_authorized=false. Chỉ có Markdown và JSON; chưa có application code. Không chạy application tests vì chưa có ứng dụng.
