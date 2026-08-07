import { supabase } from "./supabaseClient";

// TNCOS Phase M6 — Hệ thống Quản trị Tài sản số: helper truy vấn dùng
// chung cho mọi trang trong nhóm "TÀI SẢN". Toàn bộ số liệu TỔNG (giá trị,
// tăng trưởng, phân bố, KPI đạt được, phân tích) đọc qua RPC do Valuation
// Engine cung cấp (xem database/migrate_rev19_asset_management.sql PHẦN 4)
// — Dashboard KHÔNG tự cộng/trừ/tính lại bất cứ gì, chỉ hiển thị đúng
// những gì Engine đã tính trong Postgres.

export async function loadOverviewStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

  const [total, today, week, month, year, growth, distribution, topItems, topCategories, topTypes] = await Promise.all([
    supabase.rpc("asset_total_value"),
    supabase.rpc("asset_value_delta", { p_since: startOfDay }),
    supabase.rpc("asset_value_delta", { p_since: startOfWeek.toISOString() }),
    supabase.rpc("asset_value_delta", { p_since: startOfMonth }),
    supabase.rpc("asset_value_delta", { p_since: startOfYear }),
    supabase.rpc("asset_growth_series", { p_days: 30 }),
    supabase.rpc("asset_distribution_by_category"),
    supabase.rpc("asset_top_items", { p_limit: 5 }),
    supabase.rpc("asset_top_categories", { p_limit: 5 }),
    supabase.rpc("asset_top_types", { p_limit: 5 }),
  ]);

  const firstError = [total, today, week, month, year, growth, distribution, topItems, topCategories, topTypes].find(
    (r) => r.error
  )?.error;
  if (firstError) throw firstError;

  return {
    totalValue: total.data ?? 0,
    deltaToday: today.data ?? 0,
    deltaWeek: week.data ?? 0,
    deltaMonth: month.data ?? 0,
    deltaYear: year.data ?? 0,
    growthSeries: growth.data ?? [],
    distribution: distribution.data ?? [],
    topItems: topItems.data ?? [],
    topCategories: topCategories.data ?? [],
    topTypes: topTypes.data ?? [],
  };
}

export async function loadAnalysisInsights() {
  const { data, error } = await supabase.rpc("asset_analysis_insights");
  if (error) throw error;
  return data ?? [];
}

export async function loadCategoriesForSelect() {
  const { data, error } = await supabase
    .from("asset_categories")
    .select("id, name, slug")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function loadTypesForSelect() {
  const { data, error } = await supabase
    .from("asset_types")
    .select("id, name, slug, category_id, asset_categories(name)")
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export function formatVnd(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(Number(value)));
}

export function formatSignedVnd(value) {
  const n = Number(value || 0);
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${formatVnd(n)}`;
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
