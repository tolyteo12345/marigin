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
| 2 | `user-authentication` | IMPLEMENTATION | — | Prerequisite bắt buộc cho mọi module per-user (`req.user.id`, session, CSRF) mà `binance-read-only-connection` và các module downstream trong docs/DOMAIN.md cần (requirements/user-authentication.md). |
| 3 | `binance-read-only-connection` | ARCHITECTURE (BLOCKED tại IMPLEMENTATION) | `user-authentication` | Architecture đã READY nhưng giả định sẵn `req.user.id`/session/CSRF do `user-authentication` định nghĩa; implementation không thể bắt đầu trước feature #2 (requirements/user-authentication.md, requirements/binance-read-only-connection.md). |

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
