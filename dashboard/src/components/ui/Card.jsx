// TNCOS component library — Card. Wrapper bề mặt chuẩn (thay .dash-card cũ,
// vẫn tương thích class name cũ qua CSS dùng chung selector).
export default function Card({ title, actions, children, className = "" }) {
  return (
    <div className={`tncos-card ${className}`}>
      {(title || actions) && (
        <div className="tncos-card__header">
          {title && <h2>{title}</h2>}
          {actions && <div className="tncos-card__actions">{actions}</div>}
        </div>
      )}
      <div className="tncos-card__body">{children}</div>
    </div>
  );
}
