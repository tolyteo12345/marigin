# Khởi tạo và điều phối feature

1. Chọn slug kebab-case, ví dụ `binance-read-only-connection`.
2. Copy `features/decision.template.json` → `features/<feature>/decision.json`; thay feature, owner, timestamps và artifact paths. Không dùng template như một feature đã duyệt.
3. Copy các template tương ứng sang requirements/, analysis/, architecture/, qa/ khi tới stage; role đọc SYSTEM.md và shared docs trước khi làm.
4. Thực hiện `workflows/feature-development.md`. Coordinator là single writer của decision contract; role chỉ đề xuất cập nhật kèm evidence.
5. Ghi version/hash của artifacts và implementation revision/content digest được review/test. Approval cũ không áp dụng khi inputs thay đổi.

## Roadmap (thứ tự triển khai)

Bảng dưới xếp feature theo thứ tự nên làm dựa trên phụ thuộc thực tế (đọc từ Dependencies trong requirements/, không suy đoán). Đây là gợi ý điều phối, không phải gate — coordinator vẫn quyết định qua decision.json. Khi thêm feature mới hoặc phụ thuộc đổi, cập nhật bảng này thay vì đổi tên slug/thư mục.

| # | Feature | Stage hiện tại | Phụ thuộc vào | Lý do |
|---|---|---|---|---|
| 1 | `ui-visual-refresh` | DONE | — | Không đụng backend/execution, không có dependency (requirements/ui-visual-refresh.md). |
| 2 | `user-authentication` | QA (PASS_WITH_WARNINGS) | — | Prerequisite bắt buộc cho mọi module per-user (`req.user.id`, session, CSRF) mà `binance-read-only-connection` và các module downstream trong docs/DOMAIN.md cần (requirements/user-authentication.md). |
| 3 | `binance-read-only-connection` | QA (PASS_WITH_WARNINGS) | `user-authentication` | Dùng sẵn `req.user.id`/session/CSRF do `user-authentication` định nghĩa; BLOCKER-ARCH-001 đã RESOLVED sau khi `user-authentication` đạt implementation READY/review APPROVED (requirements/user-authentication.md, requirements/binance-read-only-connection.md). |
| 4 | `app-navigation-shell` | QA (PASS_WITH_WARNINGS) | `user-authentication` | Sidebar nav + client-side routing cho app đã có auth (requirements/app-navigation-shell.md). |
| 5 | `capital-provenance-ledger` | QA (PASS_WITH_WARNINGS) | `user-authentication`, `binance-read-only-connection` | Cần ownership per-user (auth) và dữ liệu liability/borrowed asset đọc từ Binance để đối chiếu (reconciliation); là nền cho Risk Engine/Profit & Repay Calculator theo docs/DOMAIN.md (requirements/capital-provenance-ledger.md). |
| 6 | `risk-engine` | QA (PASS_WITH_WARNINGS) | `user-authentication`, `binance-read-only-connection`, `capital-provenance-ledger` | Cần Borrow Position (first_borrow_entry_price, liability, exposure) từ `capital-provenance-ledger` và collateral proxy (`totalCollateralValueInUSDT`) từ `binance-read-only-connection` để tính R1 (borrow cap)/R2 (2× alert) theo docs/RISK_RULES.md (requirements/risk-engine.md). |

Ghi chú: 3 feature #2-#4 đang ở QA với warning chưa đóng (xem qa/<feature>.md), chưa chuyển DONE; điều này không chặn bắt đầu requirement/BA của feature #5 vì không có blocker ảnh hưởng ownership/dữ liệu mà #5 cần (xem decision.json từng feature).

## Quy ước contract
- stage: IDEA | REQUIREMENT | BA_FEASIBILITY | ARCHITECTURE | IMPLEMENTATION | CODE_REVIEW | QA | DONE.
- requirement_status: NOT_STARTED | IN_PROGRESS | READY.
- ba_status: NOT_STARTED | IN_PROGRESS | APPROVED | APPROVED_WITH_CONDITIONS | BLOCKED.
- architecture_status: NOT_STARTED | IN_PROGRESS | READY.
- implementation_status: NOT_STARTED | IN_PROGRESS | READY.
- review_status: NOT_STARTED | IN_PROGRESS | APPROVED | REJECTED.
- qa_status: NOT_STARTED | IN_PROGRESS | PASS | PASS_WITH_WARNINGS | FAIL.

READY là artifact đầy đủ và đã kiểm tra gate, không tự thay thế approval của BA/reviewer/QA. NOT_STARTED cũng dùng khi invalidate gate, kèm history ghi rõ lý do. blockers/open_questions/risks/conditions dùng objects có id, description, owner, affected_gates, status, evidence, resolution. status: OPEN | RESOLVED; risks có thể ACCEPTED với accepted_by, reason, evidence; không accept vi phạm invariant. Nonblocking question phải có lý do tại resolution và scope rõ ràng.

conditions bổ sung due_gate; warning bổ sung severity và accepted_by. Mọi condition đến hạn phải RESOLVED trước gate đó. Câu hỏi chưa giải quyết mà ảnh hưởng gate trở thành blocker; không chỉ đổi nhãn để đi tiếp. Unverified facts cần nằm trong analysis evidence và blocker nếu dependent scope cần dùng.

artifacts ghi path và revision cho mỗi output. history append-only gồm timestamp, actor, transition, reason và evidence. Dùng UTC ISO-8601 timestamps; coordinator ghi updated_at. Không secrets trong contract. Review/QA evidence phải match implementation_revision hiện tại. Nếu chưa có Git, dùng content digest manifest; không bịa commit SHA.

Đây là giao thức điều phối bằng tài liệu, chưa có workflow runner tự động enforce schema/gates. Agent/coordinator phải kiểm tra field/enums/gates, unresolved records và artifact revisions trước mỗi transition.
