import DashboardCard from "./DashboardCard";

function StatusRow({ label, online }) {
  return (
    <li>
      <span>{label}</span>
      <span className={online ? "status-pill status-pill--online" : "status-pill status-pill--offline"}>
        {online ? "🟢 Online" : "🔴 Offline"}
      </span>
    </li>
  );
}

export default function SystemStatusCard({ databaseOk, storageOk, authOk }) {
  return (
    <DashboardCard title="System Status">
      <ul className="system-status">
        <StatusRow label="Supabase Database" online={databaseOk} />
        <StatusRow label="Supabase Storage" online={storageOk} />
        <StatusRow label="Authentication" online={authOk} />
        {/* Trang này đang chạy nghĩa là Cloudflare Pages đã phục vụ thành
            công request hiện tại — không cần thêm 1 network check thừa chỉ
            để xác nhận điều tự nó đã đúng. */}
        <StatusRow label="Cloudflare Pages" online={true} />
      </ul>
    </DashboardCard>
  );
}
