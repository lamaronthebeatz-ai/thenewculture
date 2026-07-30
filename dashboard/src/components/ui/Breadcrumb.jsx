import { Link } from "react-router-dom";

// TNCOS component library — Breadcrumb. items: [{ label, to }] (to bỏ trống ở
// mục cuối = trang hiện tại, không phải link).
export default function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="tncos-breadcrumb">
      <ol>
        {items.map((item, idx) => (
          <li key={idx}>
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            {idx < items.length - 1 && (
              <span className="tncos-breadcrumb__sep" aria-hidden="true">
                /
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
