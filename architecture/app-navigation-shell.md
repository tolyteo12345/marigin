# Architecture: app-navigation-shell

Owner: architect-agent | Requirement revision: r1-2026-09-30 (sha256:95f8aea2ee636be86a4d55ea7e136168eebe2fc6772b6bb3f025653925a17a25)
BA revision: sha256:5f12a835d8eeb61bec3a08cbcc8a430511a62dc95f215548a0c769d5146b2f02
Decision: features/app-navigation-shell/decision.json

## Gate check và scope
BA status: APPROVED_WITH_CONDITIONS (COND-N01, COND-N02, COND-N03 — due tại gate này, xem cách giải quyết dưới). Không có blocker. Feature này **không chạm backend/DB**: không có financial logic, không có entity mới, không gọi Binance. Toàn bộ thay đổi nằm ở `frontend/` — thêm 1 dependency (`react-router`), tái cấu trúc `App.tsx` thành route tree, và 2-3 component mới (sidebar + 2 trang wrapper + trang 404). `docs/DATABASE.md` không cần cập nhật (không có schema thay đổi).

OQ-N02 (placeholder roadmap nav) giữ nguyên OPEN, không ảnh hưởng thiết kế hiện tại — không tự thêm. OQ-N03 (breakpoint cụ thể) giao cho `design/app-navigation-shell.md` quyết, kiến trúc chỉ định nghĩa cơ chế (xem "UI handoff"). OQ-N04 (back-button khi overlay mở; route sau khi đăng nhập lại) được **giải quyết ở kiến trúc này** (xem "Concurrency / idempotency" và "User confirmation / modes / security / audit") vì đây là quyết định kỹ thuật/UX thuần, không phải business policy cần user chốt thêm.

## Components và dependency contracts
Không có module backend mới. Toàn bộ nằm ở `frontend/src/`:

| Thành phần | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `frontend/src/router/routes.tsx` (mới) | Định nghĩa route tree bằng `createBrowserRouter` (React Router v8, Data mode — xem lý do dưới), export instance `router` | `react-router`, `react-router/dom` |
| `frontend/src/router/requireSession.ts` (mới) | Loader dùng chung: gọi `me()` (đã có ở `api/authClient`), nếu lỗi (401) → `throw redirect('/login')`; nếu thành công → trả data (dùng cho `useLoaderData` ở `AppShell` nếu cần hiển thị email/trạng thái) | `api/authClient` |
| `frontend/src/components/layout/AppShell.tsx` (mới) | Element của layout route bảo vệ: render `.app-header` (ThemeToggle + LogoutButton, giữ nguyên) + `NavSidebar` + `<Outlet/>` cho nội dung trang con | `NavSidebar`, `ThemeToggle`, `LogoutButton` |
| `frontend/src/components/layout/NavSidebar.tsx` (mới, common/layout component) | Render nhóm domain + mục nav (từ `navConfig.ts`), active state (`useLocation`/`NavLink`), responsive toggle/overlay | `navConfig.ts`, React Router `NavLink` |
| `frontend/src/navigation/navConfig.ts` (mới) | Nguồn dữ liệu tĩnh duy nhất cho cấu trúc nhóm/mục nav MVP (BR-002) — thêm module tương lai chỉ cần sửa file này, không rải rác trong component | Không phụ thuộc |
| `frontend/src/pages/AccountPage.tsx` (mới, thin wrapper) | Route element cho `/account`, render `<AccountLinkPanel/>` (không đổi nội dung) | `AccountLinkPanel` (đã có) |
| `frontend/src/pages/LoginPage.tsx` (mới, trích xuất từ `App.tsx` hiện tại) | Route element cho `/login`: `.app-header` (chỉ ThemeToggle) + `.card` chứa `LoginForm`/`RegisterForm` toggle — giữ nguyên 100% logic/markup hiện có, chỉ di chuyển vị trí | `LoginForm`, `RegisterForm`, `ThemeToggle` (đã có) |
| `frontend/src/pages/NotFoundPage.tsx` (mới) | Route element cho `path: "*"` — thông báo 404 + `<Link to="/account">` quay về trang mặc định | React Router `Link` |
| `BinanceConnectionsPage` (đã có, không đổi nội dung) | Dùng trực tiếp làm route element cho `/connections/binance` — không cần wrapper riêng vì component này đã tự chứa toàn bộ nội dung trang | Không đổi |
| `frontend/src/main.tsx` (sửa) | Thay `<App/>` bằng `<RouterProvider router={router}/>` | `router/routes.tsx` |

`App.tsx` cũ bị xoá hoàn toàn sau khi logic được tách vào `router/routes.tsx` + `pages/LoginPage.tsx` + `layout/AppShell.tsx` — không giữ file rỗng/dead code.

**Lý do chọn thư viện và chế độ** (giải quyết COND-N01, dựa trên BA EV-001): `react-router` v8 (gói duy nhất, `react-router-dom` đã bị loại bỏ theo EV-001 — import `RouterProvider` từ `react-router/dom`, còn lại từ `react-router`), dùng **Data mode** (`createBrowserRouter`) thay vì Declarative mode. Lý do: route guard cần chạy *trước* khi component bảo vệ render (AC-007: "không render nội dung dù chỉ trong khoảnh khắc") — `loader` của Data mode chạy trước render và có thể `throw redirect(...)` để React Router tự điều hướng mà không render element gốc dù một khung hình nào, trong khi cách làm bằng `useEffect` của Declarative mode luôn render trước rồi mới redirect sau (gây flash không thể tránh bằng pure CSS).

## Domain / storage / ledger
Không áp dụng — feature này không có entity, không đổi Prisma schema, không đổi `docs/DATABASE.md`.

## API contracts và state machines
Không thêm endpoint backend mới. Tái sử dụng nguyên vẹn `GET /api/auth/me` (`user-authentication`) làm nguồn xác thực cho route guard — không có thay đổi hợp đồng, không gọi theo cách khác với cách `App.tsx` hiện tại đang gọi (`me()` từ `api/authClient`).

### Route tree
```
createBrowserRouter([
  {
    path: "login",
    element: <LoginPage />,
  },
  {
    id: "protected",
    loader: requireSession,              // redirect('/login') nếu chưa có session
    HydrateFallback: () => <LoadingShell/>,  // AC-010: màn "Đang tải..." không có sidebar
    element: <AppShell />,               // header + NavSidebar + <Outlet/>
    children: [
      { index: true, loader: () => redirect('/account') },  // "/" -> "/account"
      { path: "account", element: <AccountPage /> },
      { path: "connections/binance", element: <BinanceConnectionsPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },   // AC-008, không cần session để xem 404
])
```

### State machine điều hướng (client-side, không phải domain state machine)
```
(App khởi động) --(router khớp path bất kỳ dưới "protected")--> gọi loader requireSession()
  requireSession() --(me() thành công)--> trả data, AppShell render bình thường
  requireSession() --(me() lỗi 401)--> throw redirect('/login') — AppShell/NavSidebar KHÔNG render (AC-007)
"/login" --(login hoặc Telegram claim thành công, gọi navigate('/account', {replace: true}))--> "/account"
  (quyết định: LUÔN điều hướng về "/account" mặc định sau đăng nhập, KHÔNG cố nhớ route trước đó
   user định ghé — xem OQ-N04 phần (b) dưới, chủ ý đơn giản hoá cho MVP)
"/account" hoặc "/connections/binance" --(LogoutButton gọi POST /api/auth/logout thành công)--> navigate('/login', {replace: true})
  (router tự revalidate loader "protected" ở lần match path kế tiếp nếu user back; vì đã navigate
   sang "/login" ngay nên không có khung hình nào render lại nội dung đã logout)
Bất kỳ path nào không khớp "login"/"account"/"connections/binance"/"" --> NotFoundPage (không qua loader requireSession,
  404 không cần phân biệt đã đăng nhập hay chưa — tránh lộ "trang này tồn tại nhưng cần login" qua sự khác biệt hành vi)
```

**Giải quyết OQ-N04**:
- (a) Back button khi overlay mobile đang mở: overlay là **state cục bộ của `NavSidebar`** (không đẩy vào history, không phải 1 "route"). `NavSidebar` tự đóng overlay bằng `useEffect` lắng nghe thay đổi `location.pathname` (từ `useLocation`) — bất kỳ điều hướng nào (kể cả do bấm back) đều tự đóng overlay. Back button hoạt động đúng ngữ nghĩa trình duyệt bình thường (quay lại route trước), không cần can thiệp `history.pushState` thủ công nào khác.
- (b) Logout giữa route con rồi đăng nhập lại: **không khôi phục lại route cũ** — luôn về `/account` (trang mặc định) sau khi đăng nhập (local hoặc Telegram) thành công, bất kể route nào đã logout từ đó. Đơn giản, không cần lưu "intended destination". Nếu sau này cần giữ UX "quay lại đúng chỗ", đây là upgrade path rõ ràng (lưu `location.pathname` vào sessionStorage trước khi redirect `/login`), không làm ở MVP vì AC không yêu cầu.

## Financial formulas
Không áp dụng.

## Concurrency / idempotency
Không có ghi dữ liệu đồng thời nào mới (feature thuần đọc + điều hướng client-side). Duy nhất 1 điểm cần nêu rõ: `requireSession` loader gọi `GET /api/auth/me` lại mỗi lần router match vào nhánh "protected" (chuyển giữa `/account` ↔ `/connections/binance` sẽ gọi lại `me()` mỗi lần vì đây là loader của route cha dùng chung cho cả 2 route con — React Router mặc định re-run loader của route đã match khi điều hướng, trừ khi tự custom `shouldRevalidate`). **Chủ ý đơn giản hoá, trần đã biết**: thêm 1 request `GET /api/auth/me` mỗi lần chuyển trang trong 2 trang MVP — chấp nhận được vì endpoint này rẻ (chỉ đọc session, không query phức tạp) và số lượng trang còn rất ít; nếu sau này có nhiều trang hơn và chi phí network đáng kể, có thể thêm `shouldRevalidate` để chỉ re-check khi cần (vd. sau khoảng thời gian, không phải mỗi click) — không làm ở MVP để tránh cache logic phức tạp hoá, nguy cơ cache sai trạng thái đăng nhập.

## User confirmation / modes / security / audit
- Không có PAPER_TRADING/LIVE, không có financial action nào trong feature này.
- **Route guard là UX, không phải security boundary**: `requireSession` chỉ ẩn/hiện UI dựa trên kết quả gọi `GET /api/auth/me` — mọi endpoint backend thật (của `user-authentication`, `binance-read-only-connection`) đã tự enforce session/ownership ở server, không phụ thuộc hay bị thay thế bởi route guard này. Một client tùy chỉnh (không qua UI) vẫn bị chặn đúng như trước, không liên quan gì đến thay đổi này.
- Không có audit event mới (không có hành động nghiệp vụ nào xảy ra ở feature này ngoài điều hướng UI).
- Không thêm secret/credential nào.

## UI handoff
Giao cho `design/app-navigation-shell.md` (chạy song song): breakpoint responsive cụ thể (OQ-N03), copy tiếng Việt chính xác cho nhãn nhóm/mục nav, nút toggle, trang 404, trạng thái loading; mapping vào common component (`Button`, và 1 component mới `NavSidebar`/`NavItem` cần thêm vào `frontend/src/components/common/` hoặc layer layout riêng — kiến trúc đặt tạm ở `components/layout/` vì đây là bố cục khung trang, khác bản chất với input/button/alert hiện có trong `components/common/`; design-agent xác nhận lại vị trí nếu có lý do khác).

Dữ liệu cấu trúc nav mà design cần tham chiếu (`navConfig.ts`, chỉ 2 nhóm theo BR-002):
```ts
export interface NavItem { path: string; label: string; }
export interface NavGroup { id: string; label: string; items: NavItem[]; }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'account', label: 'Tài khoản', items: [{ path: '/account', label: 'Tài khoản' }] },
  { id: 'binance', label: 'Kết nối sàn', items: [{ path: '/connections/binance', label: 'Kết nối Binance' }] },
];
```
Nhãn ("Tài khoản", "Kết nối sàn", "Kết nối Binance") là đề xuất kỹ thuật của kiến trúc để minh hoạ cấu trúc dữ liệu — **copy cuối cùng do design-agent quyết**, không tự chốt ở đây.

## Validation và rollout
| AC | Component | Test plan |
|---|---|---|
| AC-001 | `NavSidebar` + `navConfig.ts` | Test render `AppShell` với loader đã resolve (session hợp lệ, dùng `createMemoryRouter`) → đúng 2 nhóm/2 mục |
| AC-002 | `requireSession` loader | Test `me()` reject → `redirect('/login')` được throw, không render `AppShell` |
| AC-003 | Route tree + `NavLink` | Test (dùng `createMemoryRouter` khởi tạo tại `/account`) click mục "Kết nối Binance" → `location.pathname` đổi, `BinanceConnectionsPage` render, `AccountLinkPanel` không còn trong DOM |
| AC-004 | `NavSidebar` active state (`NavLink`'s `isActive`/`aria-current`) | Test tại từng route → đúng 1 mục có class/`aria-current="page"` |
| AC-005 | `createBrowserRouter` (deep-linkable mặc định của React Router) | Test e2e: load thẳng URL `/connections/binance` với session hợp lệ → đúng trang hiển thị (không qua click) |
| AC-006 | `NavSidebar` responsive toggle | Test giả lập viewport hẹp (`matchMedia` mock hoặc resize trong jsdom) → sidebar ẩn mặc định, toggle mở/đóng đúng; chọn 1 mục → overlay đóng (`useEffect` theo `location`) |
| AC-007 | `requireSession` loader + `HydrateFallback` | Test: session không hợp lệ, truy cập thẳng `/connections/binance` → không có lúc nào `BinanceConnectionsPage` xuất hiện trong DOM trước khi điều hướng tới `/login` |
| AC-008 | `NotFoundPage` + route `path: "*"` | Test điều hướng tới path không khớp → `NotFoundPage` render, có `<Link to="/account">`, không có error boundary nào bị kích hoạt |
| AC-009 | Token CSS token kế thừa `ui-visual-refresh` | Verify thủ công: đổi theme, kiểm tra màu `NavSidebar`/active state đổi đúng token, ghi evidence vào implementation report (không tự claim nếu chưa đo) |
| AC-010 | `HydrateFallback` của route "protected" | Test: mock `me()` chưa resolve (pending promise) → `HydrateFallback` render ("Đang tải..."), không có `NavSidebar` nào trong DOM |
| Edge case OQ-N04(a) | `NavSidebar` `useEffect([location])` | Test: mở overlay, giả lập điều hướng (back hoặc click mục khác) → overlay tự đóng |
| Edge case OQ-N04(b) | `LoginPage` → `navigate('/account')` | Test: login thành công từ route `/login` bất kỳ ngữ cảnh nào → luôn điều hướng `/account`, không phụ thuộc route đã logout trước đó |

Trước khi coi IMPLEMENTATION hoàn tất: cập nhật `frontend/src/App.test.tsx` (COND-N02) — xoá hoặc viết lại hoàn toàn theo route tree mới bằng `createMemoryRouter`, không được để test cũ còn tồn tại test logic if/else đã bị xoá khỏi code (orphan test). Không có LIVE activation, không ảnh hưởng rollback ngoài git revert thông thường. Ghi chú vận hành (COND-N03, không thuộc DONE của feature này): khi triển khai production thật, host/CDN phục vụ `frontend/dist` phải fallback mọi path không khớp file tĩnh về `index.html` (yêu cầu chuẩn của mọi client-side SPA router — vd Nginx `try_files $uri /index.html;`, hoặc cấu hình tương đương của host tĩnh) — nếu không, F5 ở `/connections/binance` trên server thật sẽ nhận 404 từ web server trước khi JS kịp chạy, phá vỡ chính AC-005. Vite dev server (`npm run dev`) đã tự động fallback đúng, không cần cấu hình gì thêm ở môi trường dev.

## Open decisions và readiness
- COND-N01: **RESOLVED** — React Router v8, Data mode (`createBrowserRouter`), loader-based guard (`requireSession` + `redirect`), `HydrateFallback` cho initial loading state.
- COND-N02: **RESOLVED** (kế hoạch, chưa thực thi — thực thi thuộc IMPLEMENTATION) — `App.test.tsx` viết lại bằng `createMemoryRouter`, liệt kê ở bảng Validation trên; backend/frontend-agent khi implement phải xoá test cũ không còn khớp, không để orphan.
- COND-N03: **RESOLVED** (ghi chú vận hành) — yêu cầu fallback `index.html` cho SPA khi deploy production, không thuộc DONE của feature này nhưng phải ghi lại để không quên.
- OQ-N01: đã RESOLVED ở BA (React Router v8 tương thích đầy đủ stack hiện có).
- OQ-N02: giữ nguyên OPEN, không ảnh hưởng kiến trúc hiện tại (chỉ ảnh hưởng khi có module mới DONE trong tương lai).
- OQ-N03: chuyển cho `design/app-navigation-shell.md` quyết định (giá trị breakpoint cụ thể) — không chặn `architecture_status READY` vì kiến trúc không phụ thuộc giá trị cụ thể, chỉ cần cơ chế (CSS + state) đã định nghĩa.
- OQ-N04: **RESOLVED** ở kiến trúc này (xem "API contracts và state machines").
- RISK-N01 (ảnh hưởng `App.test.tsx`): đã chuyển thành kế hoạch cụ thể qua COND-N02, không còn là risk mơ hồ.

**Đề xuất architecture_status: READY.** Không còn blocker hay open question nghiệp vụ nào chặn thiết kế. Phần còn lại (OQ-N03 — breakpoint cụ thể, copy tiếng Việt chính xác) thuộc `design/app-navigation-shell.md` chạy song song, không chặn architecture READY.
