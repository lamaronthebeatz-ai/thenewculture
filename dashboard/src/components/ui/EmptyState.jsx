// TNCOS component library — EmptyState.
export default function EmptyState({ icon = "—", title, description, action }) {
  return (
    <div className="tncos-empty-state">
      <div className="tncos-empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="tncos-empty-state__title">{title}</p>
      {description && <p className="tncos-empty-state__desc muted small">{description}</p>}
      {action && <div className="tncos-empty-state__action">{action}</div>}
    </div>
  );
}
