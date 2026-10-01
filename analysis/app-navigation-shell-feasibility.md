# BA feasibility: app-navigation-shell

Requirement revision: r1-2026-09-30 (sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25) | Owner: ba-feasibility-agent
Decision: features/app-navigation-shell/decision.json
Status: APPROVED_WITH_CONDITIONS

## Scope và assumption challenge
Requirement giả định cần thêm 1 client-side router mới (BR-003, OQ-N01) vì repo hiện chưa có (`frontend/package.json` không có `react-router`/`react-router-dom`/`@tanstack/react-router`). Đây là giả định đúng — đã xác nhận qua đọc trực tiếp `frontend/package.json` (React `^19.2.8`, Vite `^8.3.0`, không có dependency router nào).

BA không tìm thấy lý do mở rộng scope: 2 nhóm/mục nav (Tài khoản, Kết nối Binance) khớp đúng 2 feature đã DONE/QA, không có feature thứ 3 nào đã hoàn tất để thêm vào MVP. Quyết định "không thêm placeholder cho roadmap module" (BR-002, OQ-N02) hợp lý về kỹ thuật lẫn UX — không có rào cản nào đòi hỏi phải làm khác.

Một điểm cần lưu ý cho architect: hiện `App.tsx` dùng if/else theo state (`isLoggedIn`, `showRegister`) để quyết định render gì — đổi sang router nghĩa là **tái cấu trúc toàn bộ điểm vào ứng dụng**, không phải chỉ thêm 1 component sidebar cạnh code cũ. Route guard (BR-004, AC-007) và trang 404 (AC-008) đều là khái niệm mới hoàn toàn trong codebase — feasible kỹ thuật nhưng cần thiết kế rõ ở ARCHITECTURE (không phải nguyên nhân blocker).

## Evidence register
| ID | Claim / exact API behavior | Official URL + section | Checked at | Account scope | Evidence / limitations | Status |
|---|---|---|---|---|---|---|
| EV-001 | React Router v8.0.0 (phát hành 2026-06-17) là bản hiện hành; yêu cầu tối thiểu React 19.2.7+, Node 22.22.0+, Vite 7+, ESM-only. `react-router-dom` bị loại bỏ hoàn toàn khỏi v8 — import `RouterProvider`/`HydratedRouter` từ `react-router/dom`, phần còn lại từ `react-router` (gói duy nhất, không còn 2 gói riêng). | React Router official changelog, https://reactrouter.com/changelog | 2026-09-30 (UTC) | N/A (framework-agnostic client lib) | Trích trực tiếp changelog chính thức (PR #15076, #15062, #14928, #15077) | VERIFIED |
| EV-002 | Repo hiện tại: React `^19.2.8` (≥19.2.7, thoả), Vite `^8.3.0` (≥7, thoả), Node runtime cài trong môi trường dev là `v22.23.2` (≥22.22.0, thoả). Không có `.nvmrc`/`.node-version` pin cứng version khác. | `frontend/package.json`; `node -v` chạy trực tiếp trong repo | 2026-09-30 (UTC) | N/A | Đọc file + chạy lệnh thật, không suy đoán | VERIFIED |
| EV-003 | React Router hỗ trợ 2 chế độ dùng cho SPA thuần client-side (không cần SSR/framework mode): "Data mode" (`createBrowserRouter` + `<RouterProvider>`, hỗ trợ loader/action) và "Declarative mode" (`<BrowserRouter>` + `<Routes>`/`<Route>`, đơn giản hơn, không cần loader). Cả hai đều chạy được thuần client-side với Vite, không bắt buộc SSR/server framework. | React Router official docs (trang installation/overview), https://reactrouter.com/ | 2026-09-30 (UTC) | N/A | Đọc qua fetch tự động; trang overview không liệt kê step-by-step chi tiết cho Vite SPA thuần — cần architect đọc thêm trang "Data mode" cụ thể khi thiết kế, không ảnh hưởng tính khả thi tổng thể | VERIFIED (đủ để kết luận khả thi, chưa đủ chi tiết implementation) |

Ghi chú phương pháp: khác với feature Binance/Telegram trước, evidence ở đây không cần verify bằng tài khoản/API bên thứ ba nào — chỉ cần xác nhận (a) thư viện còn được maintain chính thức và tương thích version hiện có trong repo, (b) hỗ trợ mô hình dùng cần thiết (client-side SPA, deep-linkable). Cả hai đã xác nhận qua nguồn chính thức + kiểm tra thật trên repo (không suy đoán từ trí nhớ, đúng BR-003/OQ-N01).

## Financial feasibility
Không áp dụng — feature không có bất kỳ phép tính tài chính, unit tiền tệ, hay liability nào (khớp nhận định của requirement).

## Provenance analysis
Không áp dụng — feature không tạo/đọc borrow event, lot, hay reservation nào; chỉ tổ chức lại layout truy cập 2 trang đã có.

## API/security/operational feasibility
- **Thêm dependency mới (client-side router)**: feasible, không có rào cản license/maintenance (EV-001) và tương thích đầy đủ với stack hiện có (EV-002). Đề xuất kỹ thuật cho architect: dùng **Data mode** (`createBrowserRouter`) thay vì Declarative mode, vì route guard (BR-004: redirect nếu chưa có session trước khi render nội dung — AC-007 yêu cầu "không render nội dung dù chỉ trong khoảnh khắc") hợp với cơ chế `loader` chạy trước khi component route render, tránh flash nội dung bảo vệ rồi mới redirect (vấn đề dễ gặp nếu tự viết guard bằng `useEffect` trong Declarative mode). Đây là đề xuất, không phải quyết định cuối — architect quyết định cụ thể.
- **Route guard phía client (BR-004)**: feasible thuần bằng cách tái dùng `me()` (đã có sẵn từ `user-authentication`, xem `frontend/src/api/authClient`) trong loader/effect trước khi render route bảo vệ. Không có rào cản kỹ thuật; đúng như requirement đã ghi rõ đây chỉ là UX, backend vẫn là nguồn xác thực thật.
- **404 route (AC-008)**: feasible bằng route "catch-all" (`path: "*"`) chuẩn của mọi router React — không có rủi ro kỹ thuật.
- **Responsive/overlay sidebar (AC-006)**: thuần CSS/JS, không phụ thuộc router; feasible bằng breakpoint (giá trị cụ thể do design-agent quyết, OQ-N03) + toggle state, tương tự cách `ThemeToggle`/`localStorage` đã làm ở `ui-visual-refresh` (tái dùng pattern, không cần công nghệ mới).
- **Ảnh hưởng test hiện có**: `App.test.tsx` hiện test theo cấu trúc if/else cũ (RISK-N01 đã nêu ở requirement) — đổi sang router chắc chắn phải viết lại test này bằng cách bọc component test trong router test-utility (React Router cung cấp `createMemoryRouter`/`MemoryRouter` cho mục đích test, đây là API chuẩn của thư viện, không cần công cụ ngoài) — feasible, không phải blocker, chỉ là effort cần tính khi implement.
- **Không có yêu cầu operational mới**: không cần server route config nào (Nest backend không phục vụ SPA routing, Vite dev server đã tự động fallback `index.html` cho client-side routing; production build cần xác nhận host/CDN serve SPA có fallback `index.html` cho path không khớp file tĩnh — đây là điều kiện triển khai thông thường của mọi SPA router, không riêng gì React Router, ghi vào condition để architect không quên khi viết hướng dẫn deploy, dù DONE của feature này không bao gồm deploy thật theo AGENTS.md).

## AC coverage và missing cases
| AC | Feasible? | Ghi chú |
|---|---|---|
| AC-001 | Feasible | Render tĩnh 2 nhóm/mục theo cấu trúc dữ liệu cố định, không phụ thuộc router |
| AC-002 | Feasible | Điều kiện render dựa vào session state đã có (`me()`) |
| AC-003 | Feasible | Route `<Link>`/`navigate()` chuẩn của router (EV-001/EV-003) |
| AC-004 | Feasible | So khớp route hiện tại (`useLocation`/`matchPath` chuẩn của router) với path của từng mục nav |
| AC-005 | Feasible | Đặc tính cốt lõi của mọi client-side router (URL ↔ view đồng bộ, F5-safe vì server luôn trả `index.html` cho path SPA) |
| AC-006 | Feasible | Thuần CSS/JS, không phụ thuộc router — cần OQ-N03 (breakpoint cụ thể) từ design trước khi implement |
| AC-007 | Feasible, cần thiết kế đúng cách (xem mục trên) | Đề xuất dùng loader/data mode để tránh flash nội dung trước khi redirect |
| AC-008 | Feasible | Route catch-all chuẩn |
| AC-009 | Feasible | Thuần CSS token đã có, không có rào cản |
| AC-010 | Feasible | Điều kiện render dựa vào state `isLoggedIn === null` đã có sẵn trong `App.tsx` |

Không phát hiện case nào requirement bỏ sót ảnh hưởng feasibility. Edge case "back button khi overlay mở" và "logout giữa route con" (OQ-N04, đã ghi ở requirement) là quyết định UX cụ thể của architect/design, không phải rào cản kỹ thuật — router hỗ trợ đủ API (`navigate(-1)`, lịch sử) để implement bất kỳ lựa chọn nào.

## Decision
**APPROVED_WITH_CONDITIONS.** Requirement khả thi kỹ thuật đầy đủ; thư viện router hiện hành (React Router v8, EV-001) tương thích hoàn toàn với stack hiện có (EV-002) — OQ-N01 được RESOLVED bằng evidence này. Không có blocker nào ngăn ARCHITECTURE bắt đầu.

Conditions (due tại ARCHITECTURE):
- COND-N01 | Owner: architect-agent | Chốt cụ thể: dùng React Router v8 (EV-001), chế độ Data mode (`createBrowserRouter`) hay Declarative mode, và cách route guard implement để không flash nội dung bảo vệ trước khi redirect (đáp ứng nghiêm ngặt AC-007 "không render nội dung dù chỉ trong khoảnh khắc").
- COND-N02 | Owner: architect-agent | Thiết kế lại `App.tsx` (chuyển từ if/else state sang route tree) kèm kế hoạch cập nhật `App.test.tsx` tương ứng (dùng `createMemoryRouter`/`MemoryRouter` để test theo route, không phải mock state cũ) — không được để test cũ silently pass sai hoặc bị xoá mà không thay bằng test tương đương.
- COND-N03 | Owner: architect-agent | Xác nhận rõ trong architecture: production build/host phải fallback `index.html` cho path SPA (yêu cầu triển khai chuẩn của mọi client-side router) — ghi thành ghi chú vận hành, không thuộc phạm vi DONE của feature này (AGENTS.md: DONE không bao gồm deploy) nhưng phải được ghi lại để không bị quên khi triển khai thật sau này.

Open questions kế thừa từ requirement (không phải blocker BA, giữ nguyên OPEN, không tự chọn):
- OQ-N01: **RESOLVED** bởi EV-001/EV-002/EV-003 (evidence đầy đủ, có thể đóng ở decision.json).
- OQ-N02, OQ-N03, OQ-N04: vẫn OPEN, thuộc product/user hoặc design/architect decision, không phải BA.

Risk: không phát sinh risk mới ngoài RISK-N01 đã có ở requirement (ảnh hưởng `App.test.tsx`) — đã chuyển thành COND-N02 để đảm bảo có kế hoạch xử lý thay vì chỉ ghi nhận risk chung chung.

Không finding nào bị bỏ qua do "critical unknown" — mọi hành vi cốt lõi (version compatibility, chế độ SPA, route guard, 404, test utility) đã có evidence chính thức hoặc xác nhận trực tiếp trên repo, đủ để architect thiết kế.
