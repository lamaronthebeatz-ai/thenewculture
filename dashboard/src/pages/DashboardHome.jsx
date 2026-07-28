import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { loadDashboardData, summarize } from "../lib/dashboardData";
import HeroHeader from "../components/dashboard/HeroHeader";
import KpiGrid from "../components/dashboard/KpiGrid";
import RecentArticlesCard from "../components/dashboard/RecentArticlesCard";
import PublishingOverviewCard from "../components/dashboard/PublishingOverviewCard";
import QuickActionsCard from "../components/dashboard/QuickActionsCard";
import EditorialHealthCard from "../components/dashboard/EditorialHealthCard";
import SystemStatusCard from "../components/dashboard/SystemStatusCard";

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
        console.error("Dashboard Home: không tải được dữ liệu tổng quan:", error);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentStatus = phase === "loading" ? "loading" : phase === "error" || !data?.recentArticles.ok ? "error" : "ok";
  const publishingStatus = phase === "loading" ? "loading" : phase === "error" || !data?.articles.ok ? "error" : "ok";

  return (
    <div className="page page--wide">
      <HeroHeader editorName={editorProfile?.name} />

      <KpiGrid phase={phase} data={data} summary={summary} />

      <div className="dashboard-columns">
        <div className="dashboard-columns__main">
          <RecentArticlesCard
            status={recentStatus}
            articles={data?.recentArticles.ok ? data.recentArticles.data : []}
          />
          <PublishingOverviewCard status={publishingStatus} statusCounts={summary?.statusCounts} />
        </div>
        <div className="dashboard-columns__side">
          <QuickActionsCard />
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
