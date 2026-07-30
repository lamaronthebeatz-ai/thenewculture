// TNCOS component library — Progress (thanh tiến trình xác định). Dùng
// Skeleton (đã có ở components/Skeleton.jsx) cho trạng thái đang tải không
// xác định thời lượng.
export default function Progress({ value, max = 100, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="tncos-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="tncos-progress__track">
        <div className="tncos-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
