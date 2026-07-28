import KpiCard from "./KpiCard";

export default function KpiGrid({ phase, data, summary }) {
  function statusFor(ok) {
    if (phase === "loading") return "loading";
    if (phase === "error" || !ok) return "error";
    return "ok";
  }

  const items = [
    { label: "Total Articles", value: summary?.totalArticles, ok: data?.articles.ok },
    { label: "Published Articles", value: summary?.publishedArticles, ok: data?.articles.ok },
    { label: "Draft Articles", value: summary?.draftArticles, ok: data?.articles.ok },
    { label: "Active Authors", value: summary?.activeAuthors, ok: data?.authors.ok },
    { label: "Categories", value: summary?.categoriesCount, ok: data?.categoriesCount.ok },
    { label: "Series", value: summary?.seriesCount, ok: data?.seriesCount.ok },
    { label: "Tags", value: summary?.tagsCount, ok: data?.tagsCount.ok },
    { label: "Media Files", value: summary?.mediaCount, ok: data?.media.ok },
  ];

  return (
    <div className="kpi-grid">
      {items.map((item) => (
        <KpiCard key={item.label} label={item.label} status={statusFor(item.ok)} value={item.value} />
      ))}
    </div>
  );
}
