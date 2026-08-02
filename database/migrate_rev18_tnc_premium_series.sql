-- ============================================================================
-- TNC Platform v2.0 — Migration Rev 18: TNC Premium — series chính thức mới.
--
-- TNC Premium KHÔNG phải website/microsite/dashboard riêng — chỉ là 1 hàng
-- mới trong bảng public.series hiện có (đúng schema.sql gốc, không đổi cột
-- nào), để nó xuất hiện trong nav/"Tất cả Series"/sitemap như MỌI series
-- khác. Điểm khác biệt DUY NHẤT nằm ở build.py: URL series-tnc-premium.html
-- render 1 landing page riêng (render_premium_landing_page) thay vì trang
-- series mặc định — đúng pattern ĐÃ CÓ SẴN cho tnc-profiles/tnc-community
-- (xem "for s in SERIES" trong main(), build.py), không phát minh cơ chế
-- mới, không đổi kiến trúc.
--
-- sort_order=1000 (cao hơn hẳn 16 series hiện có, tất cả đang <100) — để
-- TNC Premium LUÔN đứng cuối danh sách SERIES, không chèn giữa và làm lệch
-- vị trí/màu accent (accent_for(i) tính theo CHỈ SỐ trong danh sách, xem
-- build.py) của 16 series đang có.
-- ============================================================================

insert into public.series (slug, name, description, accent_color, sort_order)
values (
  'tnc-premium',
  'TNC Premium',
  'Giải pháp truyền thông cao cấp dành cho ngành công nghiệp âm nhạc — quảng cáo, nội dung quảng bá, bán vé và premium combo.',
  '#D4AF37',
  1000
)
on conflict (slug) where deleted_at is null do nothing;

-- ============================================================================
-- HẾT Rev 18.
-- ============================================================================
