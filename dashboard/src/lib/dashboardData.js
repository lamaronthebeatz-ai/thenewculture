import { supabase } from "./supabaseClient";

export const ARTICLE_STATUSES = ["draft", "review", "scheduled", "published", "archived"];

// Tất cả query cần cho Dashboard Home, chạy SONG SONG (Promise.allSettled —
// không phải Promise.all: 1 query lỗi (vd Storage tạm thời không phản hồi)
// không được kéo sập toàn bộ trang, các card khác vẫn phải render bình
// thường với dữ liệu của chúng). Mỗi query chỉ lấy ĐÚNG cột cần dùng, không
// lấy dư — vd articles chỉ select "status/updated_at" cho phần thống kê,
// tách riêng khỏi query "10 bài mới nhất" (cần thêm title/author/series)
// để không phải nhúng quan hệ cho toàn bộ bảng chỉ để đếm.
export async function loadDashboardData() {
  const [
    articleStatsRes,
    recentArticlesRes,
    authorStatsRes,
    categoriesCountRes,
    seriesCountRes,
    tagsCountRes,
    mediaStatsRes,
    storageCheckRes,
  ] = await Promise.allSettled([
    supabase.from("articles").select("id, status, updated_at").is("deleted_at", null),
    // published_at: TNCOS Home cần hiển thị "Upcoming Schedule" (ngày bài
    // scheduled sẽ lên) — cột đã có sẵn trên articles, chỉ thêm vào select
    // list, không đổi logic/thứ tự truy vấn.
    supabase
      .from("articles")
      .select("id, slug, title, status, updated_at, published_at, authors(name), series(name)")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase.from("authors").select("id, is_active").is("deleted_at", null),
    supabase.from("categories").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("series").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("tags").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("media").select("id, article_id").is("deleted_at", null),
    supabase.storage.from("media").list("", { limit: 1 }),
  ]);

  return {
    articles: unwrapRows(articleStatsRes),
    recentArticles: unwrapRows(recentArticlesRes),
    authors: unwrapRows(authorStatsRes),
    categoriesCount: unwrapCount(categoriesCountRes),
    seriesCount: unwrapCount(seriesCountRes),
    tagsCount: unwrapCount(tagsCountRes),
    media: unwrapRows(mediaStatsRes),
    storageOk: storageCheckRes.status === "fulfilled" && !storageCheckRes.value.error,
    databaseOk: articleStatsRes.status === "fulfilled" && !articleStatsRes.value.error,
  };
}

function unwrapRows(settled) {
  if (settled.status !== "fulfilled" || settled.value.error) {
    return { ok: false, data: null, error: settled.status === "fulfilled" ? settled.value.error : settled.reason };
  }
  return { ok: true, data: settled.value.data, error: null };
}

function unwrapCount(settled) {
  if (settled.status !== "fulfilled" || settled.value.error) {
    return { ok: false, count: null, error: settled.status === "fulfilled" ? settled.value.error : settled.reason };
  }
  return { ok: true, count: settled.value.count, error: null };
}

// Tổng hợp thuần (không gọi mạng) từ kết quả loadDashboardData() — tách
// riêng để dễ test và tái dùng cho các trang thống kê khác sau này
// (Analytics/Workflow) mà không phải viết lại logic đếm.
export function summarize(data) {
  const articles = data.articles.ok ? data.articles.data : null;
  const statusCounts = Object.fromEntries(ARTICLE_STATUSES.map((s) => [s, 0]));
  if (articles) {
    for (const a of articles) {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status] += 1;
    }
  }

  const authors = data.authors.ok ? data.authors.data : null;
  const activeAuthors = authors ? authors.filter((a) => a.is_active).length : null;
  const inactiveAuthors = authors ? authors.filter((a) => !a.is_active).length : null;

  const media = data.media.ok ? data.media.data : null;
  const unusedMedia = media ? media.filter((m) => !m.article_id).length : null;

  return {
    totalArticles: articles ? articles.length : null,
    publishedArticles: articles ? statusCounts.published : null,
    draftArticles: articles ? statusCounts.draft : null,
    activeAuthors,
    inactiveAuthors,
    categoriesCount: data.categoriesCount.ok ? data.categoriesCount.count : null,
    seriesCount: data.seriesCount.ok ? data.seriesCount.count : null,
    tagsCount: data.tagsCount.ok ? data.tagsCount.count : null,
    mediaCount: media ? media.length : null,
    unusedMedia,
    statusCounts: articles ? statusCounts : null,
    scheduledCount: articles ? statusCounts.scheduled : null,
  };
}
