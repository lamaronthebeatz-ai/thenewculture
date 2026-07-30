# TNCOS Phase 1 — UX Foundation

Tài liệu tổng hợp 12 deliverable của Phase 1 ("THE NEW CULTURE / TNCOS /
PHASE 1 — UX FOUNDATION"). Không đổi Database/Supabase/API/Authentication/
RBAC/Business Logic/Workflow/Publishing — toàn bộ nội dung dưới đây chỉ nói
về Information Architecture/Navigation/Layout/Component/Interaction/
Responsive/Design Token.

## 1. Information Architecture

Sidebar quy về 6 nhóm chức năng thay vì danh sách phẳng — nguồn duy nhất ở
`src/layout/navConfig.js` (dùng chung cho `Sidebar.jsx` desktop/tablet và
`MobileNav.jsx`):

- **Workspace** — Home
- **Editorial** — Articles, Authors, Categories, Series, Tags, TNC Selects,
  TNC Magazine
- **Publishing** — Hero Manager, Advertisement Manager, Promotion Manager,
  Announcement Manager, Menu Builder, Footer Builder
- **Media** — Media Library
- **Administration** — Users, Roles & Permissions, Organization, Activity Log
  (mỗi mục gate theo đúng permission tương ứng, xem Dashboard V2.1)
- **Settings** — Site Settings, Profile

Thêm module mới chỉ cần thêm 1 dòng vào đúng nhóm trong `navConfig.js`.

## 2. Navigation Blueprint

Desktop: 3 panel (Sidebar | Main Workspace | Inspector), xem `AppShell.jsx`.

- **Sidebar**: expandable/collapsible (icon-rail, nút `«`/`»`, persist
  `localStorage`), resizable (kéo cạnh phải, clamp 200–360px, hỗ trợ
  ArrowLeft/ArrowRight khi focus vào handle — bàn phím dùng được, không chỉ
  chuột), keyboard accessible (`<nav aria-label>`, mọi link/button đều
  focus-visible được).
- **Favorites**: ghim bất kỳ nav item nào (nút ★ cạnh mỗi mục), hiện thành
  nhóm riêng đầu Sidebar.
- **Recent**: 5 trang gần nhất tự động ghi nhận khi điều hướng
  (`AppShell.jsx` → `useTrackRecent()`).
- **Pinned**: dùng chung cơ chế với Favorites ở Phase 1 (pin nội dung cụ
  thể — vd 1 bài viết — cần cột/bảng riêng, đây là hạng mục Phase 2, xem
  mục "Đề xuất Phase 2" cuối tài liệu).
- **Inspector**: panel cố định bên phải ở desktop (`InspectorPanel.jsx`,
  `variant="panel"`), Drawer trượt phải ở tablet/mobile (`variant="drawer"`)
  — không dùng popup/modal. Wiring thật demo trên module Articles
  (`components/ArticleInspector.jsx`, nút "Inspect" ở `ArticlesList.jsx`):
  tab Metadata/SEO/History (activity_log thật)/Publish/Properties.

## 3. Responsive Blueprint

Mốc breakpoint (ghi ở `tokens.css`, dùng nhất quán toàn bộ `shell.css`):
Desktop `> 1080px`, Tablet `641–1080px`, Mobile `<= 640px`.

- **Desktop**: 3 panel như trên.
- **Tablet**: 2 panel — Sidebar thành overlay (nút hamburger ở Topbar +
  scrim mờ nền), Inspector thành Drawer thay vì cột cố định.
- **Mobile**: Bottom Navigation 5 mục (Home/Articles/Search/Activity/Menu,
  `MobileNav.jsx`) + Drawer đáy chứa toàn bộ IA khi bấm "Menu" — Main
  Workspace toàn màn hình, one-hand friendly (mọi nút chạm tối thiểu
  `--touch-target-min: 44px`).

## 4. Design Token System

`src/styles/tokens.css` — spacing (bội số 4px), radius, typography scale,
elevation/shadow, opacity, motion (duration/easing), z-index, breakpoint
tham chiếu, icon/button/input size. Toàn bộ component mới dùng token này,
không hardcode giá trị. Biến màu cũ (`--brand`/`--surface`/`--border`...)
giữ nguyên, chỉ mở rộng thêm.

## 5. Component Library

`src/components/ui/` (vanilla React + CSS, không thêm dependency): Button,
Badge, Avatar, Card, Tabs, Accordion, Breadcrumb, Dialog, Drawer, Popover,
Tooltip, Toast (+ToastProvider/useToast), EmptyState, ErrorState, Progress,
Input, Textarea, Select, Table. Style ở `src/styles/ui.css`. Trang hiện có
(dùng `.btn`/`.form`/`.data-table` trực tiếp) không bị đổi — cùng nền tảng
token nên vẫn nhất quán về hình ảnh; migrate từng trang sang dùng thẳng
component mới là việc tăng dần, không bắt buộc ngay để tránh rewrite toàn
bộ ~25 trang trong 1 phase.

## 6. Motion Guideline

`src/styles/motion.css`: fade-in/scale-in/slide-in-right/slide-up cho
Dialog/Drawer/Popover/Toast mở-đóng, `.tncos-pressable` cho trạng thái
pressed. Duration 80–400ms (token `--duration-*`), easing chuẩn
(`--ease-standard/decelerate/accelerate/spring`). `prefers-reduced-motion:
reduce` tắt toàn bộ animation/transition tập trung ở `tokens.css` — không
cần xử lý riêng lẻ ở từng component.

## 7. Accessibility Guideline

- Skip link ("Bỏ qua tới nội dung chính") tới `#tncos-main`.
- `:focus-visible` toàn cục (outline 2px, offset 2px).
- ARIA: `nav[aria-label]`, Dialog/Drawer `role="dialog" aria-modal`, Tabs
  `role="tablist"/"tab"/"tabpanel"` + điều hướng ArrowLeft/ArrowRight, Toast
  region `role="status" aria-live="polite"`, favorite/collapse button đều
  có `aria-label`/`aria-pressed`/`aria-expanded` phù hợp.
- Focus trap cơ bản cho Dialog (focus phần tử đầu tiên khi mở, trả focus
  lại khi đóng), Escape + click-ra-ngoài đóng Dialog/Drawer/Popover
  (`useDismiss.js`).
- Touch target tối thiểu 44px trên mobile (bottom nav).
- Contrast: giữ nguyên bảng màu đã qua audit trước đó (Production Audit),
  chỉ thêm token không đổi giá trị màu nền/chữ hiện có.

## 8–10. Desktop / Tablet / Mobile Layout

Xem mục 2–3 — hiện thực trong `shell.css` (`@media (max-width: 1080px)` và
`@media (max-width: 640px)`), đã verify bằng Playwright screenshot thật ở 3
viewport (1440×900 / 900×1024 / 390×844) trong quá trình phát triển.

## 11. Wireframe

Không có file wireframe riêng (Figma/hình vẽ tay) — code chính là hiện thực
hoá trực tiếp, verify bằng screenshot thật thay cho wireframe tĩnh (xem
Testing Report trong báo cáo commit).

## 12. UX Documentation

Chính là tài liệu này.

## Đề xuất Phase 2 (không triển khai ở Phase 1, theo đúng yêu cầu)

- Command Palette (⌘K), Context Menu, Dock, Advanced Animation/Micro
  Interaction, Visual Polish — như đã nêu rõ trong yêu cầu Phase 1.
- Pinned nội dung cụ thể (không chỉ nav item) — cần bảng `pinned_items`
  (user_id, content_type, content_id) — đây LÀ thay đổi Database nên cố
  tình để ngoài Phase 1.
- Migrate từng trang nội dung (Articles/Media/...) sang dùng thẳng
  component `ui/` mới thay vì class CSS thuần, và mở rộng Inspector panel
  wiring ra các module khác ngoài Articles.
- Universal Search: thêm action/command thực thi được (không chỉ tìm +
  điều hướng) khi Command Palette triển khai.
