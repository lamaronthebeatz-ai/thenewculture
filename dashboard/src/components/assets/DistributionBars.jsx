import { formatVnd } from "../../lib/assetsData";

// Biểu đồ phân bố theo Danh mục (PHẦN XIII spec) — cố tình KHÔNG dùng biểu
// đồ tròn (donut/pie) cần 1 bảng màu categorical nhiều hue (phải validate
// CVD riêng, thêm token màu mới ngoài phạm vi Design System hiện có, đúng
// yêu cầu "Không thêm Design System mới"). Dùng thanh ngang ĐÚNG 1 hue
// (--brand có sẵn), độ dài mã hoá độ lớn — đọc chính xác hơn góc/màu để so
// sánh nhiều danh mục, không cần chú giải màu.
export default function DistributionBars({ data }) {
  if (!data || data.length === 0) {
    return <p className="muted small">Chưa có dữ liệu phân bố theo danh mục.</p>;
  }
  const max = Math.max(...data.map((d) => Number(d.total_value) || 0), 1);
  return (
    <div className="asset-dist">
      {data.map((row) => {
        const pct = Math.max(0, Math.min(100, ((Number(row.total_value) || 0) / max) * 100));
        return (
          <div className="asset-dist__row" key={row.category_id || row.category_name}>
            <div className="asset-dist__label">
              <span>{row.category_name}</span>
              <span className="muted small">{row.item_count} tài sản</span>
            </div>
            <div className="asset-dist__track">
              <div className="asset-dist__bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="asset-dist__value">{formatVnd(row.total_value)}</div>
          </div>
        );
      })}
    </div>
  );
}
