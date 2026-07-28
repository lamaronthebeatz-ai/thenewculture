import { Link } from "react-router-dom";
import DashboardCard from "./DashboardCard";

const ACTIONS = [
  { to: "/articles/new", label: "New Article" },
  { to: "/authors/new", label: "New Author" },
  { to: "/media/new", label: "Upload Media" },
  { to: "/categories/new", label: "New Category" },
  { to: "/series/new", label: "New Series" },
  // Tags dùng sửa nhanh inline ngay trong danh sách (không có route riêng),
  // xem src/pages/TagsList.jsx.
  { to: "/tags", label: "New Tag" },
];

export default function QuickActionsCard() {
  return (
    <DashboardCard title="Quick Actions">
      <div className="quick-actions">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="quick-actions__item">
            <span className="quick-actions__plus">+</span>
            {a.label}
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}
