// Wrapper dùng chung cho mọi card trong Dashboard Home (và các trang thống
// kê sau này — Analytics/Workflow) để không lặp lại markup header/action.
export default function DashboardCard({ title, action, children, className = "" }) {
  return (
    <section className={`dash-card ${className}`}>
      <header className="dash-card__header">
        <h2>{title}</h2>
        {action}
      </header>
      <div className="dash-card__body">{children}</div>
    </section>
  );
}
