import { useMemo, useRef, useState } from "react";
import { formatVnd } from "../../lib/assetsData";

const WIDTH = 720;
const HEIGHT = 220;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

// Biểu đồ tăng trưởng (PHẦN XIII spec) — 1 chuỗi duy nhất (tổng giá trị
// theo ngày), nên dùng ĐÚNG 1 hue (--brand, màu thương hiệu sẵn có của
// Dashboard) thay vì bảng màu categorical — không cần legend cho 1 series.
// Có crosshair + tooltip khi rê chuột (đúng nguyên tắc "line/area luôn có
// hover layer"). Không thêm màu/token mới ngoài --brand đã có sẵn.
export default function GrowthChart({ data }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  const { points, areaPath, linePath, minV, maxV } = useMemo(() => {
    if (!data || data.length === 0) return { points: [], areaPath: "", linePath: "", minV: 0, maxV: 0 };
    const values = data.map((d) => Number(d.total_value) || 0);
    let min = Math.min(...values, 0);
    let max = Math.max(...values, 0);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const pts = data.map((d, i) => {
      const x = PAD_LEFT + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
      const v = Number(d.total_value) || 0;
      const y = PAD_TOP + innerH - ((v - min) / (max - min)) * innerH;
      return { x, y, v, day: d.day };
    });
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(2)},${PAD_TOP + innerH} L${pts[0].x.toFixed(2)},${PAD_TOP + innerH} Z`;
    return { points: pts, areaPath: area, linePath: line, minV: min, maxV: max };
  }, [data]);

  if (!data || data.length === 0) {
    return <p className="muted small">Chưa có dữ liệu để vẽ biểu đồ tăng trưởng.</p>;
  }

  function handleMove(e) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const hp = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="asset-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="asset-chart__svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Biểu đồ tăng trưởng tổng giá trị tài sản 30 ngày gần nhất"
      >
        <line x1={PAD_LEFT} y1={HEIGHT - PAD_BOTTOM} x2={WIDTH - PAD_RIGHT} y2={HEIGHT - PAD_BOTTOM} className="asset-chart__axis" />
        <path d={areaPath} className="asset-chart__area" />
        <path d={linePath} className="asset-chart__line" />
        {hp && (
          <g>
            <line x1={hp.x} y1={PAD_TOP} x2={hp.x} y2={HEIGHT - PAD_BOTTOM} className="asset-chart__crosshair" />
            <circle cx={hp.x} cy={hp.y} r={4} className="asset-chart__dot" />
          </g>
        )}
      </svg>
      <div className="asset-chart__legend">
        <span>{points[0]?.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
      {hp && (
        <div className="asset-chart__tooltip" style={{ left: `${(hp.x / WIDTH) * 100}%` }}>
          <strong>{formatVnd(hp.v)}</strong>
          <span>{hp.day}</span>
        </div>
      )}
    </div>
  );
}
