# Workflow phát triển feature

IDEA → REQUIREMENT → BA_FEASIBILITY → ARCHITECTURE ‖ DESIGN (feature có UI) → IMPLEMENTATION → CODE_REVIEW → QA → DONE.

ARCHITECTURE và DESIGN chạy song song sau BA_FEASIBILITY, không phụ thuộc lẫn nhau để bắt đầu, nhưng cả hai phải READY trước khi IMPLEMENTATION mở khóa phần frontend. Feature không có UI (backend-only) bỏ qua DESIGN, `design_status` giữ `NOT_APPLICABLE`.

## Handoff và gates
| Stage | Owner / input | Output và exit gate |
|---|---|---|
| IDEA | Coordinator / ý tưởng user | decision.json mới, scope và owner; không code |
| REQUIREMENT | product-requirement / idea + domain | requirements/<feature>.md; testable AC và rule IDs, out-of-scope, open questions; requirement READY |
| BA_FEASIBILITY | ba-feasibility / requirement revision | analysis/<feature>-feasibility.md; evidence/API/financial checks; APPROVED hoặc APPROVED_WITH_CONDITIONS có conditions rõ |
| ARCHITECTURE | architect / BA + requirement | architecture/<feature>.md; trace AC, schema/state/API/security/concurrency/test strategy; READY khi không còn blocker ảnh hưởng thiết kế |
| DESIGN | design-agent / BA + requirement (chỉ feature có UI) | design/<feature>.md; luồng màn hình, trạng thái UI bắt buộc (mode, freshness, estimated/actual, reserved, partial/unknown, loading/error/empty), mapping vào common component library; READY khi mọi màn hình/trạng thái bắt buộc đã có spec và không còn open question ảnh hưởng implementation |
| IMPLEMENTATION | backend + frontend / approved inputs | thực thi đúng scope, tests và evidence, Swagger doc + Postman collection khớp API thực tế (xem `AGENTS.md`); chỉ bắt đầu khi user đã yêu cầu implementation, architecture READY, design READY (nếu áp dụng) và conditions due gate đã giải quyết. Frontend implement phải bám design/<feature>.md và tái dùng common component đã liệt kê, không tự phát minh pattern UI mới ngoài spec |
| CODE_REVIEW | independent code-review / diff + inputs + tests | features/<feature>/review.md; APPROVED hoặc REJECTED, gắn implementation revision |
| QA | qa / reviewed revision + AC | qa/<feature>.md; PASS, PASS_WITH_WARNINGS hoặc FAIL, cùng revision |
| DONE | Coordinator / toàn bộ evidence | mọi gate hợp lệ, không blocker/condition overdue, warnings được xử lý theo policy |

## Stop và conditional approval
BA BLOCKED: dừng dependent feature, quay về requirement để làm rõ hoặc thu thập verification evidence; BA phải review lại trước tiến tiếp. Không code “tạm” để vượt blocker.

APPROVED_WITH_CONDITIONS chỉ cho phép stage không bị condition chặn. Mỗi condition có owner, evidence cần đạt, affected_gates và due_gate. Condition ảnh hưởng collateral/provenance/confirmation/API execution không được đẩy sang sau implementation. Có thể tách read-only scope thành feature riêng với BA review lại, không bỏ blocker trong feature gốc.

Review REJECTED hoặc QA FAIL → IMPLEMENTATION. Sau mọi sửa code, review và QA cũ bị invalidate; luôn quay lại CODE_REVIEW trước QA, kể cả sửa từ QA. Giữ findings/history cũ và ghi evidence đóng từng finding.

## Invalidation
- Requirement đổi nội dung: BA, architecture, implementation readiness, review, QA → NOT_STARTED (giữ code/artifacts để đánh giá lại, không xóa).
- BA policy/evidence thay đổi có tác động: architecture, design và downstream readiness reset.
- Architecture đổi: implementation readiness, review, QA reset. Nếu thay đổi ảnh hưởng state/API shape mà design đã dựa vào, design reset theo.
- Design đổi (feature có UI): frontend implementation readiness, review, QA phần frontend reset.
- Implementation đổi: review, QA reset.
- Chỉ sửa editorial không tác động có thể giữ approval nếu owner gate xác nhận lý do/evidence trong history; không tự suy diễn.

## Definition of Done
Requirement READY; BA APPROVED hoặc APPROVED_WITH_CONDITIONS mà mọi condition đã RESOLVED; architecture READY; design READY hoặc NOT_APPLICABLE; implementation READY; review APPROVED; QA PASS hoặc PASS_WITH_WARNINGS với warning không ảnh hưởng correctness/security/financial invariants và được user/product owner chấp nhận rõ ràng. Không có open blocker hoặc câu hỏi ảnh hưởng scope. Risk chưa xử lý cần owner, mitigation và explicit acceptance nếu residual risk; invariant không được waive.

Artifact revisions phải khớp, AC→implementation→tests→review findings traceable, không secrets/live test, docs và audit/reconciliation behavior được kiểm tra. DONE không có nghĩa deploy hoặc bật LIVE; các việc đó có scope/authorization riêng.

## Dispatch packet
Mỗi handoff gửi feature slug, role SYSTEM.md, decision.json revision, artifact paths/revisions, scope, unresolved items và expected output. Role trả artifact + status đề xuất + evidence + blocker/condition updates. Coordinator kiểm tra và ghi atomically contract với history; nếu revision đã đổi, đọc lại trước khi ghi để tránh overwrite.
