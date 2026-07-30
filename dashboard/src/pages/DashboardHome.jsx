import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { loadDashboardData, summarize } from "../lib/dashboardData";
import HeroHeader from "../components/dashboard/HeroHeader";
import KpiGrid from "../components/dashboard/KpiGrid";
import QuickActionsCard from "../components/dashboard/QuickActionsCard";
import ContinueWorkingCard from "../components/dashboard/ContinueWorkingCard";
import PublishingQueueCard from "../components/dashboard/PublishingQueueCard";
import NotificationsCard from "../components/dashboard/NotificationsCard";
import EditorialHealthCard from "../components/dashboard/EditorialHealthCard";
import SystemStatusCard from "../components/dashboard/SystemStatusCard";

// TNCOS Home — thứ tự đúng "Home Experience" đã nêu: Greeting -> Quick
// Actions -> Continue Working/Recent Draft (gộp) -> Publishing Queue/
// Upcoming Schedule (gộp) -> Notifications -> Storage (gộp vào System
// Status, xem SystemStatusCard) -> System Status. KPI grid + Editorial
// Health giữ lại từ Dashboard Home cũ (vẫn đúng tinh thần "system overview",
// không có trong danh sách loại trừ). Toàn bộ dùng lại NGUYÊN VẸN
// loadDashboardData()/summarize() — không đổi business logic/query, chỉ
// tổ chức lại cách trình bày + 1 dòng select bổ sung (published_at) và 1
// query mới cho Notifications (activity_log, đã có sẵn từ V2.1).
export default function DashboardHome() {
  const { editorProfile, session } = useAuth();
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboardData()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setSummary(summarize(result));
        setPhase("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("TNCOS Home: không tải được dữ liệu tổng quan:", error);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentStatus = phase === "loading" ? "loading" : phase === "error" || !data?.recentArticles.ok ? "error" : "ok";

  return (
    <div className="page page--wide">
      <HeroHeader editorName={editorProfile?.name} />

      <QuickActionsCard />

      <KpiGrid phase={phase} data={data} summary={summary} />

      <div className="dashboard-columns">
        <div className="dashboard-columns__main">
          <ContinueWorkingCard
            status={recentStatus}
            articles={data?.recentArticles.ok ? data.recentArticles.data : []}
            editorName={editorProfile?.name}
          />
          <PublishingQueueCard status={recentStatus} articles={data?.recentArticles.ok ? data.recentArticles.data : []} />
        </div>
        <div className="dashboard-columns__side">
          <NotificationsCard />
          <EditorialHealthCard phase={phase} data={data} summary={summary} />
          <SystemStatusCard
            databaseOk={phase === "ready" && !!data?.databaseOk}
            storageOk={phase === "ready" && !!data?.storageOk}
            authOk={!!session}
          />
        </div>
      </div>
    </div>
  );
}
