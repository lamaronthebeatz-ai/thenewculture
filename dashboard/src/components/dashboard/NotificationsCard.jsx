import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardCard from "./DashboardCard";
import Skeleton from "../Skeleton";
import { supabase } from "../../lib/supabaseClient";
import { formatRelative } from "../../lib/format";

// TNCOS Home — Notifications: nhật ký hoạt động gần đây (activity_log, Rev
// 13) của chính người dùng — RLS đã tự giới hạn "chỉ xem log của chính
// mình" nếu không có quyền system.view (đúng hành vi hiện có, không đổi).
export default function NotificationsCard() {
  const [status, setStatus] = useState("loading");
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("activity_log")
      .select("id, action, target_type, created_at")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus("error");
          return;
        }
        setItems(data || []);
        setStatus("ok");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardCard
      title="Notifications"
      action={
        <Link to="/activity-log" className="tncos-btn tncos-btn--ghost tncos-btn--sm">
          View All
        </Link>
      }
    >
      {status === "loading" && (
        <div className="skeleton-rows">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} height="1.2rem" />
          ))}
        </div>
      )}
      {status === "error" && <p className="field-error">Không tải được nhật ký hoạt động.</p>}
      {status === "ok" && items.length === 0 && <p className="muted small">Chưa có hoạt động nào gần đây.</p>}
      {status === "ok" && items.length > 0 && (
        <ul className="notifications__list">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                {item.action}
                {item.target_type && <span className="muted small"> · {item.target_type}</span>}
              </span>
              <span className="muted small">{formatRelative(item.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
