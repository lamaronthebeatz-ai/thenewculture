import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";

export default function EditorialHealthCard({ phase, data, summary }) {
  function statusFor(ok) {
    if (phase === "loading") return "loading";
    if (phase === "error" || !ok) return "error";
    return "ok";
  }

  const items = [
    { label: "Draft cần xử lý", value: summary?.draftArticles, ok: data?.articles.ok },
    { label: "Scheduled sắp xuất bản", value: summary?.scheduledCount, ok: data?.articles.ok },
    { label: "Author inactive", value: summary?.inactiveAuthors, ok: data?.authors.ok },
    { label: "Media chưa sử dụng", value: summary?.unusedMedia, ok: data?.media.ok },
  ];

  return (
    <DashboardCard title="Editorial Health">
      <ul className="editorial-health">
        {items.map((item) => {
          const st = statusFor(item.ok);
          return (
            <li key={item.label}>
              <span>{item.label}</span>
              {st === "loading" && <Skeleton width="2rem" height="1.2rem" />}
              {st === "error" && <span className="muted">Coming Soon</span>}
              {st === "ok" && <strong>{item.value}</strong>}
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
