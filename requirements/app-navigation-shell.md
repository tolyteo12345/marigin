# Requirement: app-navigation-shell

Revision: r1-2026-09-30 | Owner: product-requirement-agent | Decision: features/app-navigation-shell/decision.json

## Problem, user và outcome
Sau khi `user-authentication` và `binance-read-only-connection` đạt DONE/QA, `frontend/src/App.tsx` khi đã đăng nhập chỉ render 2 panel (`AccountLinkPanel`, `BinanceConnectionsPage`) xếp chồng trong cùng 1 khối `.dashboard`, không có bất kỳ cơ chế điều hướng nào. Không có vấn đề với 2 panel hiện tại (còn xem được cả 2 cùng lúc), nhưng docs/DOMAIN.md liệt kê nhiều module tương lai (Margin Dashboard, Borrowable Coin Scanner, Overvaluation Scoring Engine, Borrow Position Manager, Repayment Manager, Portfolio Analytics...) — nếu cứ xếp chồng panel, màn hình sẽ không thể mở rộng và user không có cách nào biết/chọn khu vực chức năng nào đang xem.

Đây không phải feature nghiệp vụ trading — không tính toán tài chính, không thêm chức năng mới nào ngoài việc tổ chức lại cách truy cập các chức năng đã có/sẽ có. Đây là UI chrome (khung điều hướng), tương tự vai trò nền tảng của `user-authentication` (identity) nhưng cho lớp điều hướng.

Quyết định cấu trúc đã được user chốt trực tiếp (2026-09-30), ghi làm business decision, KHÔNG phải giả định của agent này:
- **Kiểu điều hướng**: sidebar trái, cố định trên desktop, có thể thu gọn/overlay trên mobile.
- **Cách nhóm mục nav**: nhóm theo domain (vd. "Tài khoản", "Kết nối sàn") ngay từ MVP, không chờ có nhiều mục mới nhóm.
- **Nội dung hiện tại**: tách `AccountLinkPanel` và `BinanceConnectionsPage` thành 2 trang điều hướng riêng biệt (không còn xếp chồng chung 1 dashboard).
- **Routing**: bắt buộc deep-linkable — URL phải phản ánh đúng trang đang xem, F5/bookmark giữ đúng trang (cần thêm client-side router, hiện repo chưa có).

Outcome đo được:
- User đã đăng nhập nhìn thấy sidebar liệt kê đúng 2 nhóm domain hiện có (Tài khoản, Kết nối Binance), mỗi nhóm 1 mục nav dẫn tới 1 trang riêng.
- Click 1 mục nav → URL đổi, chỉ nội dung trang tương ứng hiển thị (không còn cả 2 panel cùng lúc), mục đang active có visual phân biệt rõ.
- Reload trang (F5) hoặc mở lại URL đã bookmark → đúng trang đó hiển thị lại, không bị reset về trang mặc định.
- Trên viewport hẹp (mobile), sidebar không chiếm chỗ nội dung mặc định — có nút mở/đóng dạng overlay.
- Chưa đăng nhập: không có sidebar (không có gì để điều hướng); truy cập thẳng URL của trang cần đăng nhập khi chưa có session → đưa về màn hình đăng nhập, không lộ nội dung.

## Scope / MVP / non-goals

In-scope (MVP):
- Sidebar trái persistent (desktop) chứa 2 nhóm domain, mỗi nhóm 1 mục nav:
  - Nhóm "Tài khoản" → trang chứa nội dung `AccountLinkPanel` hiện có (không đổi nội dung/AC của `user-authentication`).
  - Nhóm "Kết nối Binance" → trang chứa nội dung `BinanceConnectionsPage` hiện có (không đổi nội dung/AC của `binance-read-only-connection`).
- Thêm client-side router (thư viện cụ thể do BA xác minh — xem OQ-N01) để mỗi trang có URL riêng, deep-linkable, F5-safe.
- Active state: mục nav tương ứng trang đang xem có style phân biệt.
- Route guard phía client: URL của trang cần đăng nhập mà chưa có session → redirect về màn hình đăng nhập (không thay thế server-side ownership/session check đã có, chỉ là UX, tương tự cách `App.tsx` hiện tại check `me()`).
- Route không tồn tại (gõ sai URL) → trang 404 trong-app, có link quay về trang mặc định, không crash trắng trang.
- Responsive: dưới 1 breakpoint (giá trị cụ thể do design-agent quyết — OQ-N03), sidebar ẩn mặc định, có nút toggle mở dạng overlay; trên breakpoint đó sidebar hiển thị persistent.
- Header hiện có (`ThemeToggle`, `LogoutButton`) giữ nguyên vị trí/hành vi, không đổi theo feature này.
- Áp dụng đúng theme token hiện có từ `design/ui-visual-refresh.md` (dark/light) lên toàn bộ sidebar/nav — không có màu cứng mới ngoài token đã có, trừ khi design-agent xác nhận cần token mới (vd. radius/width riêng cho sidebar).

Out-of-scope (không tự thêm ngoài yêu cầu):
- Role-based visibility / phân quyền hiển thị mục nav theo role — hệ thống hiện chưa có khái niệm role nào (`requirements/user-authentication.md` xác nhận "Phân quyền/role... không được yêu cầu"). Không tự phát minh role ở đây.
- Placeholder / mục nav "sắp ra mắt" (disabled) cho các module roadmap trong docs/DOMAIN.md (Margin Dashboard, Borrowable Coin Scanner, Risk Engine, Repayment Manager, Portfolio Analytics...) chưa có bất kỳ implementation nào — không thêm dead-link hoặc hứa hẹn tính năng chưa tồn tại. Khi 1 module đó đạt DONE, coordinator dispatch requirement riêng để bổ sung nhóm/mục nav tương ứng (xem OQ-N02).
- Đổi nội dung/AC/business rule của `user-authentication` hoặc `binance-read-only-connection` — feature này chỉ tổ chức lại layout truy cập, không đổi hành vi nghiệp vụ bên trong 2 trang đó.
- Breadcrumb, search trong nav, keyboard shortcut điều hướng, persist trạng thái collapse sidebar qua session — không được yêu cầu, không tự thêm (có thể là follow-up sau nếu user muốn).
- Quản lý đa thiết bị/đa tab đồng bộ trạng thái đăng nhập — ngoài scope, giữ nguyên hành vi hiện tại của `user-authentication`.

Dependencies: `user-authentication` (DONE — cung cấp `me()`/session để route guard dựa vào) và `binance-read-only-connection` (QA PASS_WITH_WARNINGS — cung cấp `BinanceConnectionsPage` sẽ được tách thành trang riêng). Thêm 1 dependency kỹ thuật mới: client-side router (chưa có trong `frontend/package.json`) — BA phải xác minh thư viện hiện hành còn maintain tốt.

## User stories
- US-001: Là user đã đăng nhập, tôi muốn thấy sidebar liệt kê các khu vực chức năng đã có (Tài khoản, Kết nối Binance) để biết mình có thể vào đâu.
- US-002: Là user, tôi muốn click 1 mục nav để chuyển sang đúng trang tương ứng, chỉ thấy nội dung của trang đó (không lẫn nội dung trang khác).
- US-003: Là user, tôi muốn biết mình đang ở trang nào (active state rõ ràng trên sidebar).
- US-004: Là user, tôi muốn bookmark hoặc F5 một trang cụ thể và quay lại đúng trang đó, không bị đưa về trang mặc định.
- US-005: Là user dùng màn hình nhỏ (mobile), tôi muốn sidebar không chiếm hết màn hình mặc định, có thể mở ra khi cần rồi đóng lại.
- US-006: Là user chưa đăng nhập, nếu tôi cố mở thẳng URL của 1 trang cần đăng nhập, tôi muốn được đưa về màn hình đăng nhập thay vì thấy lỗi hoặc trang trắng.
- US-007: Là user, khi tôi gõ nhầm URL không tồn tại, tôi muốn thấy thông báo rõ ràng và có đường quay lại, không phải trang trắng/crash.

## Business rules
| ID | Rule + units | Source | Verification / question |
|---|---|---|---|
| BR-001 | Sidebar chỉ hiển thị khi có session hợp lệ (đã đăng nhập); chưa đăng nhập không hiển thị bất kỳ phần tử điều hướng nào (không có gì để điều hướng tới). | Quyết định nghiệp vụ user (2026-09-30) | Verified (business decision) |
| BR-002 | MVP có đúng 2 nhóm domain, mỗi nhóm 1 mục nav: "Tài khoản" (nội dung `AccountLinkPanel`) và "Kết nối Binance" (nội dung `BinanceConnectionsPage`). Không thêm nhóm/mục placeholder cho module chưa DONE trong docs/DOMAIN.md. | Quyết định nghiệp vụ user (2026-09-30) | Verified (business decision) |
| BR-003 | Điều hướng dùng client-side router mới với URL riêng cho từng trang, deep-linkable (F5/bookmark giữ đúng trang). Thư viện cụ thể do BA xác minh còn được maintain, không chọn theo trí nhớ. | Quyết định nghiệp vụ user (2026-09-30) | NEEDS_VERIFICATION (BA) — xem OQ-N01 |
| BR-004 | Route cần đăng nhập được guard ở phía client (redirect về màn hình đăng nhập nếu chưa có session) — đây là UX, KHÔNG thay thế bất kỳ session/ownership check nào ở backend; backend vẫn phải tự chặn theo session thật (đã có ở `user-authentication`/`binance-read-only-connection`). | AGENTS.md (server luôn là nguồn xác thực thật) | Verified (nguyên tắc bảo mật cơ bản) |
| BR-005 | Không có role/permission nào chi phối việc hiển thị mục nav — hệ thống hiện chưa có khái niệm role. | requirements/user-authentication.md (xác nhận không có role ở MVP) | Verified (kế thừa quyết định đã chốt) |
| BR-006 | Toàn bộ màu sắc/spacing của sidebar/nav dùng token đã định nghĩa ở `design/ui-visual-refresh.md`; token mới (nếu cần, vd. width sidebar) do design-agent bổ sung, không tự đặt giá trị tuỳ ý ở đây. | design/ui-visual-refresh.md | Verified (kế thừa quyết định đã chốt) |

## Acceptance criteria
| ID | Given / When / Then | Rule | Expected evidence |
|---|---|---|---|
| AC-001 | Given user đã đăng nhập, When vào app, Then sidebar hiển thị đúng 2 nhóm ("Tài khoản", "Kết nối Binance"), mỗi nhóm đúng 1 mục nav | BR-001, BR-002 | Test: render app với session hợp lệ → sidebar chứa đúng 2 mục, đúng nhãn |
| AC-002 | Given user chưa đăng nhập, When vào app, Then không có sidebar/mục nav nào hiển thị | BR-001 | Test: render app không có session → không tìm thấy sidebar trong DOM |
| AC-003 | Given user đã đăng nhập ở 1 trang bất kỳ, When click mục nav khác, Then URL đổi sang route của trang đó, chỉ nội dung trang đó hiển thị (không còn nội dung trang cũ) | BR-002, BR-003 | Test: click nav "Kết nối Binance" → URL đổi, `BinanceConnectionsPage` render, `AccountLinkPanel` không còn trong DOM |
| AC-004 | Given user đang ở 1 trang, When nhìn sidebar, Then mục nav tương ứng trang hiện tại có class/style active phân biệt các mục khác | BR-002 | Test: kiểm tra class active gắn đúng mục theo route hiện tại |
| AC-005 | Given user đã đăng nhập và ở 1 trang cụ thể (vd "Tài khoản"), When reload (F5) hoặc mở lại URL đó ở tab mới có session, Then vẫn hiển thị đúng "Tài khoản", không bị đưa về trang mặc định | BR-003 | Test e2e: điều hướng tới route, reload, assert vẫn đúng route/nội dung |
| AC-006 | Given viewport dưới breakpoint mobile (giá trị theo design-agent), When vào app đã đăng nhập, Then sidebar ẩn mặc định, có nút toggle hiển thị; bấm toggle → sidebar mở dạng overlay; chọn 1 mục nav → overlay tự đóng | BR-002 (layout thuộc DESIGN) | Test: giả lập viewport hẹp → sidebar ẩn, toggle hoạt động đúng |
| AC-007 | Given chưa đăng nhập, When gõ thẳng URL của 1 trang cần đăng nhập (vd URL "Kết nối Binance"), Then bị redirect về màn hình đăng nhập, không render nội dung trang đó dù chỉ trong khoảnh khắc | BR-004 | Test: truy cập route bảo vệ không session → redirect, không có network call lộ dữ liệu trang đó |
| AC-008 | Given đã đăng nhập, When gõ URL không khớp route nào đã định nghĩa, Then hiển thị trang 404 trong-app kèm link quay về trang mặc định, không crash/trang trắng | BR-002 | Test: điều hướng route không tồn tại → thấy nội dung 404, không có unhandled error trong console |
| AC-009 | Given đang ở theme dark hoặc light (đã có từ `ui-visual-refresh`), When xem sidebar, Then toàn bộ màu nền/chữ/active-state của sidebar đổi đúng theo theme, dùng đúng token đã định nghĩa | BR-006 | Test/verify thủ công: chuyển theme, kiểm tra sidebar đổi màu đúng token, không có màu cứng lệch theme |
| AC-010 | Given `App.tsx` đang trong khoảng xác định session (`isLoggedIn === null`, giống trạng thái "Đang tải..." hiện có), When màn hình này hiển thị, Then KHÔNG render sidebar (tránh flash sai trạng thái trước khi biết chắc đã đăng nhập hay chưa) | BR-001 | Test: mock `me()` chưa resolve → assert sidebar không có trong DOM ở trạng thái loading |

## Financial định nghĩa và UX
Không áp dụng — feature này không tính toán tài chính, không thêm/đổi số liệu nghiệp vụ nào. Chỉ là UX của lớp điều hướng bao quanh nội dung đã có (`AccountLinkPanel`, `BinanceConnectionsPage`), nội dung bên trong 2 trang đó giữ nguyên theo AC gốc của `user-authentication` và `binance-read-only-connection`.

## Edge cases
- Overlay sidebar đang mở trên mobile, user bấm nút back của trình duyệt — hành vi (đóng overlay hay điều hướng lịch sử trang) chưa chốt, cần architect/design quyết định nhất quán (OQ-N04 liên quan).
- User logout khi đang ở 1 route con (vd "Kết nối Binance") — cần redirect ngay về màn hình đăng nhập; khi đăng nhập lại có quay về đúng route cũ hay luôn về trang mặc định — chưa chốt (OQ-N04).
- Resize cửa sổ trình duyệt băng qua breakpoint mobile/desktop trong khi overlay đang mở — không được để sidebar kẹt ở trạng thái overlay che nội dung khi đã ở kích thước desktop.
- Nhiều tab cùng 1 user mở các route khác nhau, logout ở 1 tab — các tab khác không tự đồng bộ ngay (kế thừa quyết định đã chốt ở `user-authentication`: không quản lý đa thiết bị/đa tab).
- Route đang có unsaved input (vd đang gõ dở form liên kết Telegram ở trang Tài khoản) rồi user click sang mục nav khác — không có yêu cầu "xác nhận rời trang" nào (chưa từng có ở feature liên quan), giữ hành vi chuyển ngay, không tự thêm confirm dialog.
- Session hết hạn giữa lúc user đang ở 1 route con (không phải do chủ động logout) — cần trả 401 nhất quán và route guard client phải phản ứng đúng (redirect), không hiển thị nội dung cache cũ như còn hợp lệ.

## Open questions / risks / dependencies
- OQ-N01 | Owner: BA | Affected gates: BA_FEASIBILITY, ARCHITECTURE | Thư viện client-side router hiện hành cho React (version cụ thể, tình trạng maintain) — cần evidence từ tài liệu chính thức, không chọn theo trí nhớ (BR-003).
- OQ-N02 | Owner: product + user | Affected gates: không chặn gate nào hiện tại (thông tin cho tương lai) | Roadmap modules trong docs/DOMAIN.md (Margin Dashboard, Borrowable Coin Scanner, Risk Engine, Repayment Manager, Portfolio Analytics...) chưa có nav item theo BR-002; khi 1 module đạt DONE, coordinator dispatch requirement bổ sung riêng cho nhóm/mục nav tương ứng.
- OQ-N03 | Owner: design-agent | Affected gate: DESIGN | Giá trị breakpoint cụ thể (px) chuyển sidebar cố định (desktop) sang overlay (mobile) — quyết định UI convention, không phải business policy.
- OQ-N04 | Owner: architect + design | Affected gates: ARCHITECTURE, DESIGN | Hành vi chính xác khi (a) back button lúc overlay mở, (b) logout giữa route con rồi đăng nhập lại có quay về đúng route cũ hay không — chưa chốt, cần thiết kế rõ trước khi implementation.
- RISK-N01 | Owner: architect | Thêm client-side router là thay đổi cấu trúc `App.tsx` tương đối lớn (từ if/else state sang route-based) — có thể ảnh hưởng test hiện có (`App.test.tsx`) cần cập nhật theo, không phải regression nhưng cần rà soát khi implement.

## Handoff checklist
- AC-001..AC-010 trace tới BR-001..BR-006.
- Quyết định cấu trúc cốt lõi (sidebar, nhóm theo domain, tách trang, deep-linkable routing) đã được user chốt trực tiếp 2026-09-30 — không phải giả định của agent này.
- Non-goals liệt kê rõ (role visibility, placeholder roadmap, đổi AC của 2 feature nền) để BA/architect không tự mở rộng scope.
- OQ-N01 (thư viện router) là điều kiện cần verify trước ARCHITECTURE do đây là dependency kỹ thuật mới hoàn toàn trong repo — không chặn requirement_status vì không phải business policy, nhưng BA phải xác minh trước khi architect thiết kế route contract.
- Đề xuất requirement_status: READY (đủ AC/BR/scope cho BA feasibility review).
