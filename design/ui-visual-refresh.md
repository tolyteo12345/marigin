# Design: ui-visual-refresh

Revision: 3 | Owner: coordinator (design-agent role) | Decision: features/ui-visual-refresh/decision.json

**Ghi chú rev 3 (2026-10-01)**: user cung cấp 4 ảnh tham chiếu UI near.com (`.demo/home/*.png`, `.demo/login/*.png`, gitignored, không commit) và yêu cầu follow phong cách đó, dùng Tailwind CSS. Quyết định đã hỏi lại user trước khi làm (AskUserQuestion, không tự chọn ngầm):
1. Nội dung trang đăng nhập **giữ nguyên** (email+password + Telegram) — chỉ đổi style/layout theo near.com, KHÔNG thêm passkey/wallet connect (ngoài scope sản phẩm).
2. Cấu trúc sidebar **giữ nguyên** (nhóm theo domain, đã duyệt ở `design/app-navigation-shell.md`) — chỉ đổi màu/icon/spacing theo near.com, KHÔNG thêm submenu "Account" (Settings/Referrals/Gifts/Support/Help/Terms) vì các trang đó chưa tồn tại trong sản phẩm.
3. Tailwind CSS: **rewrite toàn bộ** CSS thủ công hiện có (`.btn`, `.card`, `.field`, `.inline-message`...) sang Tailwind utility class — user chọn làm ngay, không làm dần.

Thay đổi cụ thể so với rev 2:
- **Cơ chế styling**: thay toàn bộ custom CSS class (`.btn-primary`, `.card`, `.field`...) bằng Tailwind utility class viết trực tiếp trong JSX. Cơ chế theme (CSS custom properties `--color-*` trong `:root`/`:root[data-theme='light']`, `ThemeProvider` set `data-theme`, `localStorage`) **giữ nguyên không đổi** — components tham chiếu token qua cú pháp Tailwind arbitrary value (`bg-[var(--color-surface)]`) thay vì class riêng, nên theme switching vẫn hoạt động đúng như architecture đã duyệt, không cần đổi `architecture/ui-visual-refresh.md`.
- **Giá trị token màu** chỉnh lại sát near.com hơn (vẫn cùng vai trò/tên biến, không đổi contract): `--color-bg: #09090b` (near-black, trước `#0B0E11`), `--color-surface: #18181b`, `--color-border: #27272a`, `--color-text-primary: #fafafa`, `--color-text-secondary: #a1a1aa`. `--color-accent`/`--color-danger`/`--color-success` giữ nguyên giá trị cũ (đã kiểm WCAG AA ở rev 1, gần giống tông near.com sẵn).
- **Bỏ 2 token** `--font-size-*`/`--space-*`/`--radius*` dạng CSS variable — thay bằng thang đo chuẩn của Tailwind (`text-sm`, `p-6`, `rounded-lg`/`rounded-2xl`...) để tận dụng hệ thống nhất quán có sẵn thay vì duy trì song song 2 hệ thống spacing. `--shadow` giữ lại (dùng qua `shadow-[var(--shadow)]`) vì giá trị multi-layer phức tạp hơn 1 cấp Tailwind thường có.
- **Nav active state** (ảnh hưởng `design/app-navigation-shell.md`, xem rev kèm theo ở đó): đổi từ "viền trái + nền tint accent" sang pill nền `--color-border` đồng nhất (giống near.com — ảnh tham chiếu dùng highlight xám trung tính cho mục đang active, KHÔNG dùng màu accent cho active state, màu accent chỉ dành cho tín hiệu tích cực/thương hiệu).
- **Top accent bar**: thêm dải màu mỏng 3px ở mép trên cùng viewport (gradient `--color-accent` → `--color-accent-hover`), thuần trang trí, lấy cảm hứng từ near.com. Thuần CSS (`#root::before`), không phải Tailwind utility vì áp dụng toàn cục 1 lần, không lặp lại ở nhiều component.
- **Không thêm logo/wordmark** — giữ nguyên quyết định đã ghi ở rev 1/2 ("không tự chế thương hiệu khi chưa có tên sản phẩm chính thức"); near.com có logo "near" ở đầu sidebar nhưng đây là nội dung thương hiệu, ngoài thẩm quyền design-agent.
- **Icon cho nav item**: thêm icon line-art inline SVG (không thêm icon-library dependency, chỉ 2 mục ở MVP — xem `frontend/src/navigation/icons.tsx`), theo đúng tinh thần near.com dùng icon cho mỗi mục sidebar.

Mapping component → Tailwind cụ thể xem trực tiếp trong code (`Button.tsx`, `TextField.tsx`, `InlineMessage.tsx` — các class string được định nghĩa 1 lần trong component, không lặp lại rải rác). Không ghi lại bảng mapping riêng ở đây để tránh lệch pha giữa doc và code — nguồn sự thật là chính component.

**Giới hạn môi trường**: không có browser tool thật trong môi trường này để chụp ảnh/so khớp trực tiếp với near.com — đã verify qua: (a) đọc output CSS build thật xác nhận mọi Tailwind arbitrary-value class (color-mix, border-left, translate-x responsive, aria-selected variant...) compile đúng, không bị Tailwind âm thầm bỏ qua; (b) 25 test tự động (DOM/accessibility attributes) vẫn pass nguyên sau rewrite. Cần user tự chạy `npm run dev` xem bằng mắt và so với `.demo/*.png` trước khi coi đạt yêu cầu — giống đúng tiền lệ COND-002 ở rev 2.

**Ghi chú rev 2**: rev 1 chỉ đặc tả token màu/typography/spacing và mapping vào component, KHÔNG đặc tả page composition (bố cục tổng thể). Implementation rev 1 áp đúng token nhưng giữ nguyên layout cũ của template scaffold (`#root` cố định 1126px, `border-inline`, không card, không center) — kết quả: form tràn full-width, để trống phần lớn màn hình, không giống tham chiếu Hyperliquid (card căn giữa, viền/shadow rõ, mật độ hợp lý). User xác nhận qua screenshot thật (chụp bằng Playwright, xem lịch sử decision.json) "quá xấu, không giống Hyperliquid". Rev 2 bổ sung mục "Layout / composition" bên dưới để lấp khoảng trống spec này. Theo workflows/feature-development.md: design đổi → invalidate frontend implementation readiness/review/QA, phải làm lại.

## Input
- requirements/ui-visual-refresh.md r2 (BR-001..004, US-001..004, AC-001..006, OQ-002 giao cho design-agent)
- architecture/ui-visual-refresh.md (cơ chế: CSS custom properties + `[data-theme]` attribute, `ThemeProvider` context, `localStorage` key `mtl-theme`, không thư viện theming ngoài)
- `design/user-authentication.md` — spec màn hình/trạng thái/component hiện có (KHÔNG lặp lại ở đây; tài liệu này chỉ định token + theme mechanism áp lên các màn hình đó, không đổi cấu trúc màn hình/copy/AC của feature user-authentication)
- Code hiện có: `frontend/src/index.css`, `frontend/src/components/common/{Button,TextField,InlineMessage}.tsx`, `frontend/src/components/AccountLinkPanel.tsx`

## Nguyên tắc token (tham chiếu Hyperliquid)
Hyperliquid dùng: nền gần đen (không phải đen tuyệt đối), surface phân lớp nhẹ bằng độ sáng chứ không viền nặng, accent bão hòa cao cho tín hiệu tích cực/tiêu cực (xanh lá = tăng/thành công, đỏ = giảm/lỗi), chữ số dùng font monospace để căn cột dễ so sánh, mật độ thông tin cao nhưng khoảng trắng đủ để không rối. App hiện tại chưa hiển thị số liệu tài chính (chỉ auth/account-link) nên phần monospace/numeric chỉ định nghĩa token, chưa có nơi dùng — ghi rõ để tránh áp monospace sai chỗ (vd. text thường không dùng monospace).

## Design tokens
Định nghĩa bằng CSS custom properties trong `frontend/src/index.css`, biến dark ở `:root` (mặc định theo BR-003), override trong `:root[data-theme='light']`.

### Màu — Dark (mặc định)
| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-bg` | `#0B0E11` | Nền trang |
| `--color-surface` | `#151A1F` | Nền card/panel (AccountLinkPanel, form container) |
| `--color-border` | `#232A31` | Viền input, divider |
| `--color-text-primary` | `#E8ECEF` | Text chính, label |
| `--color-text-secondary` | `#848E9C` | Hint text, placeholder, text phụ |
| `--color-accent` | `#00D4AA` | Primary button, focus ring, trạng thái "Đã liên kết" |
| `--color-accent-hover` | `#00B894` | Primary button hover |
| `--color-danger` | `#FF5C5C` | InlineAlert, trạng thái lỗi, "Chưa liên kết" nếu cần nhấn mạnh |
| `--color-success` | `#00D4AA` | InlineStatus (dùng chung tông với accent — nhất quán tín hiệu tích cực) |

### Màu — Light
| Token | Giá trị |
|---|---|
| `--color-bg` | `#FFFFFF` |
| `--color-surface` | `#F5F6F8` |
| `--color-border` | `#E2E5E9` |
| `--color-text-primary` | `#1A1D21` |
| `--color-text-secondary` | `#5B6470` |
| `--color-accent` | `#007A5E` |
| `--color-accent-hover` | `#006B52` |
| `--color-danger` | `#D93025` |
| `--color-success` | `#007A5E` |

Ghi chú: `--color-accent`/`--color-danger` ở light đậm hơn bản dark tương ứng để giữ tỷ lệ tương phản ≥ 4.5:1 trên nền trắng (WCAG AA cho text thường). **Cập nhật khi implement**: giá trị `#00A886` ban đầu đo được ~3.02:1 khi dùng làm nền cho text trắng (`.btn-primary`) hoặc làm màu text trên nền trắng (`InlineStatus`) — không đạt AA. Đổi sang `#007A5E` (đo được ~5.34:1 theo cả hai chiều text/nền) theo đúng quy trình "phát hiện contrast không đạt → cập nhật token ở đây, ghi lại lý do" thay vì tự đổi ở CSS mà không note.

### Typography
| Token | Giá trị | Dùng cho |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | Toàn bộ UI text (label, button, copy) — không thêm web font mới để tránh phụ thuộc network/FOUC ngoài scope |
| `--font-mono` | `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace` | Reserve cho số liệu tài chính tương lai (chưa dùng trong feature này — không có số liệu nào hiển thị) |
| `--font-size-base` | `14px` | Body text, input |
| `--font-size-sm` | `12px` | Hint text, label phụ |
| `--font-size-lg` | `18px` | Heading (vd. "Liên kết tài khoản") |

### Spacing / shape
| Token | Giá trị |
|---|---|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `16px` |
| `--space-lg` | `24px` |
| `--radius` | `6px` (button, input, card — Hyperliquid dùng bo góc nhỏ, không pill-shape) |

## Mapping vào common component (không đổi props/interface)
| Component | Class hiện có | Thay đổi CSS |
|---|---|---|
| `Button` (`btn`, `btn-primary`, `btn-secondary`) | primary: nền `--color-accent`, chữ `--color-bg` (đảo màu để tương phản tốt trên nền tối/sáng); secondary: nền `transparent`, viền `--color-border`, chữ `--color-text-primary`. Hover dùng `--color-accent-hover`. `disabled`: opacity 0.5, không đổi cursor logic (đã có sẵn qua thuộc tính `disabled` native). |
| `TextField` (`field`, label + input) | input: nền `--color-surface`, viền `--color-border`, chữ `--color-text-primary`; label: `--color-text-secondary`, `--font-size-sm`. Focus: viền `--color-accent` + outline nhẹ (giữ visible focus ring cho keyboard nav — không xoá outline mặc định mà không thay thế). |
| `InlineAlert` (`inline-message-alert`, `role="alert"`) | nền surface pha `--color-danger` ở opacity thấp (vd. `color-mix` hoặc rgba cố định), chữ `--color-danger`, viền trái 3px `--color-danger` (nhấn mạnh không chỉ dựa vào màu chữ — hỗ trợ người khó phân biệt màu, role="alert" vẫn là tín hiệu chính cho screen reader). |
| `InlineStatus` (`inline-message-status`, `role="status"`) | tương tự InlineAlert nhưng dùng `--color-success`. |

Không component nào cần thêm props mới; toàn bộ đổi qua CSS thuần, đúng như architecture đã xác nhận khả thi.

## Layout / composition (mới, rev 2)
Vấn đề rev 1 để lại: `#root` trong `index.css` cũ có `width: 1126px` cố định + `border-inline` — đây là leftover của template scaffold (Vite starter), không phải chủ ý Hyperliquid-style. Kết quả thật (screenshot) là form nằm sát top-left trong một cột hẹp giữa 2 đường viền dọc, phần còn lại màn hình trống trơn — không có card, không center dọc, không phân biệt nền trang vs nền nội dung.

**Tham chiếu Hyperliquid cho auth/connect screen**: nội dung nằm trong một **card** — nền `--color-surface` phân biệt rõ với nền trang `--color-bg`, viền `--color-border` 1px, bo góc lớn hơn button (12–16px), có shadow nhẹ tạo độ nổi, padding rộng rãi (24–32px), **căn giữa cả ngang và dọc** trong viewport, độ rộng giới hạn (không kéo full-width) để tập trung mắt nhìn.

Cấu trúc mới cho `frontend/src/App.tsx` (áp dụng cả nhánh đã đăng nhập và chưa đăng nhập):
```
#root                          (full width/height, flex column, không còn width cố định/border-inline)
└── .app-header                (thanh trên cùng, full width, border-bottom, justify-end — chứa ThemeToggle [+ LogoutButton khi đã đăng nhập])
└── .app-main                  (flex: 1, display flex, center cả 2 trục, padding)
    └── .card                  (max-width 420px, background --color-surface, border 1px --color-border,
                                 border-radius 12px, box-shadow var(--shadow), padding --space-lg)
        └── nội dung màn hình hiện có (tabs/form cho auth, hoặc AccountLinkPanel content khi đã đăng nhập)
```
Token mới cần thêm: `--radius-lg: 12px` (radius riêng cho card, khác `--radius: 6px` của button/input — Hyperliquid dùng 2 cấp bo góc, card bo nhiều hơn control bên trong).

Không thêm brand/logo/wordmark mới — đây là quyết định content (tên sản phẩm) ngoài thẩm quyền design-agent, không tự chế ra để tránh fabricate. Nếu user muốn thêm branding, đó là yêu cầu riêng.

`.card` áp dụng cho: LoginForm/RegisterForm (nhánh chưa đăng nhập) và AccountLinkPanel (nhánh đã đăng nhập) — mỗi nhánh một `.card`, không lồng card trong card.

## Theme toggle
- Component mới `ThemeToggle` (spec theo architecture, dùng `Button variant="secondary"`), đặt ở góc phải trên cùng của `App.tsx` shell, ngang hàng với `LogoutButton` khi đã đăng nhập; khi chưa đăng nhập vẫn hiển thị (theme là preference thiết bị, không gắn đăng nhập — đúng US-004).
- Label: icon + text ngắn theo trạng thái hiện tại — "🌙 Dark" khi đang dark (bấm để chuyển light), "☀️ Light" khi đang light (bấm để chuyển dark). Text tiếng Việt không cần vì đây là nhãn chế độ hiển thị, không phải nội dung nghiệp vụ; giữ "Dark"/"Light" cho ngắn gọn và phổ biến.
- `aria-pressed` = `true` khi đang ở light (dùng như toggle button pattern chuẩn), `aria-label="Chuyển chế độ sáng/tối"` để screen reader rõ chức năng dù label hiển thị là tiếng Anh.
- Click → `toggleTheme()` từ `ThemeProvider` → set `data-theme` trên `document.documentElement` → CSS variables đổi ngay lập tức (không cần re-render component con vì thuần CSS) → ghi `localStorage['mtl-theme']`.

## Trạng thái UI bắt buộc (rà theo AGENTS.md)
Feature này không có mode READ_ONLY/PAPER_TRADING/LIVE, không có freshness/estimated-actual/reserved funds (đã xác nhận ở requirement — app hiện tại không có các khái niệm này). Trạng thái UI cần rà là loading/error/empty/disabled của **theme init**:
- Trước khi `ThemeProvider` đọc xong `localStorage` (synchronous theo architecture): không có khoảng "loading" vì đọc đồng bộ trong state initializer, tránh flash-of-wrong-theme — đây là lý do architecture chọn synchronous read thay vì `useEffect`.
- `localStorage` không khả dụng (private mode chặn, throw exception): fallback `'dark'`, không hiển thị lỗi nào cho user (đây là preference tiện ích, không phải data quan trọng cần báo lỗi).

## Accessibility
- Giữ nguyên toàn bộ role/label/htmlFor đã có trong `design/user-authentication.md` — không đổi khi áp token.
- Contrast: mọi cặp text/background token ở trên nhắm WCAG AA (≥4.5:1 text thường, ≥3:1 large text/icon) — frontend-agent verify thật khi implement, ghi evidence vào implementation report nếu có công cụ đo, không tự claim đạt chuẩn nếu chưa đo.
- Focus indicator: không được xoá `outline` mặc định của trình duyệt mà không thay bằng viền `--color-accent` rõ ràng — bắt buộc cho keyboard navigation, áp dụng cả 2 theme.
- `ThemeToggle` phải keyboard-accessible (native `<button>` qua `Button` component — đã đảm bảo).

## Unresolved / handoff
Không còn open question ảnh hưởng implementation — OQ-002 (token cụ thể + cơ chế theme) đã trả lời ở tài liệu này. Frontend-agent triển khai theo: architecture (ThemeProvider/ThemeToggle/localStorage) + token bảng trên + mục "Layout / composition" (rev 2) cho cấu trúc `.app-header`/`.app-main`/`.card`. Không tự phát minh token/màu/layout ngoài spec; nếu cần điều chỉnh trong lúc implement (vd. contrast không đạt, hoặc layout vẫn chưa đúng sau khi áp spec này), quay lại design-agent để cập nhật, không tự đổi rồi không ghi lại.

## Đề xuất trạng thái
design_status: READY (rev 2). Rev 1 implementation/review/qa bị invalidate theo mục "Ghi chú rev 2" — cần frontend-agent làm lại phần layout, sau đó review + QA lại.
