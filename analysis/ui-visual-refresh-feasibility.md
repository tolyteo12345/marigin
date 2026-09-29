# BA feasibility: ui-visual-refresh

Requirement revision: 2 | Owner: ba-feasibility-agent
Decision: features/ui-visual-refresh/decision.json
Status: APPROVED

## Scope và assumption challenge
Requirement (rev 2) yêu cầu: (1) design tokens dark+light lấy cảm hứng Hyperliquid, (2) áp dụng lại styling cho 5 component hiện có + common library (Button, TextField, InlineMessage), (3) theme toggle với persistence. Đây là thay đổi visual/CSS-layer thuần túy.

Kiểm tra code thực tế (`frontend/src/components/common/*.tsx`, `frontend/src/main.tsx`, `frontend/src/index.css`):
- Button/TextField/InlineMessage chỉ gán class name tĩnh (`btn`, `btn-primary`, `field`, `inline-message-alert`...), không có logic nghiệp vụ, không inline style, không phụ thuộc theme hiện tại. Toàn bộ style tập trung một chỗ: `frontend/src/index.css`.
- Không có state/context nào cho theme hiện nay — cần thêm mới (không phải sửa cái có sẵn), nên không có rủi ro invalidate logic hiện tại.

Assumption của requirement là **khả thi và đúng**: đổi token + thêm `data-theme` attribute ở root (`document.documentElement` hoặc `#root`) cùng CSS variables trong `index.css` đủ để phủ toàn bộ 5 màn hình mà không phải sửa props/API của component nào. Không có alternative scope nào rẻ hơn hoặc rủi ro hơn cần cân nhắc thêm.

Không có gì trong domain/risk rules (đã đọc `docs/DOMAIN.md`, `docs/RISK_RULES.md`) áp dụng cho thay đổi thuần CSS/visual không chạm business logic, state tài chính, hay confirmation flow.

## Evidence register
Không áp dụng — feature không gọi Binance API hay bất kỳ third-party API nào, không có claim cần verify bằng tài liệu chính thức. Bảng evidence bỏ trống có chủ đích (không phải thiếu sót).

## Financial feasibility
Không áp dụng — không có principal/interest/fee/PnL/exposure nào trong scope. Feature không hiển thị và không tính toán số liệu tài chính.

## Provenance analysis
Không áp dụng — không chạm ledger, capital allocation, hay disposal policy.

## API/security/operational feasibility
- Không có endpoint mới, không đổi permission scope, không đổi auth flow.
- Persist theme choice: dùng `localStorage` (client-side, không phải secret, không phải dữ liệu nhạy cảm) — không vi phạm quy tắc "không log secret/không secret plaintext". Nếu sau này cần đồng bộ theme qua account (server-side), đó là scope mở rộng riêng, không nằm trong feature này.
- Không có concurrency/idempotency/reconciliation concern vì không có write nào tới backend.

## AC coverage và missing cases
| AC | Feasible? | Ghi chú |
|---|---|---|
| AC-001 (LoginForm/RegisterForm dùng token mới) | Feasible | Chỉ cần CSS/token, component hiện tại đã tách class rõ ràng |
| AC-002 (AccountLinkPanel state indicator) | Feasible | Cần xác nhận với design-agent các state hiện tại (linked/unlinked/error) map class nào — chưa thấy trong scan nhanh, design-agent cần đọc `AccountLinkPanel.tsx` khi làm design/<feature>.md |
| AC-003 (common component tự nhận style mới không sửa call site) | Feasible | Xác nhận qua code: props không chứa style/className bắt buộc phải đổi |
| AC-004 (test hiện có vẫn pass) | Feasible với điều kiện | Test dựa vào `role` (alert/status) và behavior, không assert vào class CSS cụ thể theo quan sát trong `InlineMessage.tsx`; frontend-agent cần chạy lại test suite thật sau khi đổi CSS để xác nhận, không suy đoán |
| AC-005 (toggle theme đổi ngay lập tức) | Feasible | Cần thêm theme state/context mới (chưa tồn tại) — việc này nằm trong scope "thiết lập design tokens", ARCHITECTURE/DESIGN cần chỉ định nơi đặt state (React context nhỏ, không cần global state library) |
| AC-006 (persist qua reload) | Feasible | `localStorage` + đọc giá trị lúc khởi tạo app |

Không phát hiện case nào bị thiếu hoặc không khả thi.

## Decision
APPROVED — không có blocker. Scope không đụng bất kỳ invariant tài chính, provenance, hay confirmation flow nào trong AGENTS.md/RISK_RULES.md. Toàn bộ rủi ro nằm ở mức UI/CSS thuần túy, thuộc thẩm quyền design-agent (token cụ thể — OQ-002 đã ghi ở requirement) và architect-agent (nơi đặt theme state/context nếu cần xem như một thay đổi kiến trúc nhỏ, dù nhẹ).

Không có condition nào cần gắn due_gate — feature có thể tiến thẳng sang ARCHITECTURE ‖ DESIGN song song theo workflow chuẩn (feature có UI).
