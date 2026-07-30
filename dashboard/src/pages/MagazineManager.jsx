import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import ImageUploader from "../components/ImageUploader";

// Migration TNC Magazine: Sveltia -> Dashboard (không phải tính năng mới).
//
// Field khớp CHÍNH XÁC đúng 6 field Sveltia collection "magazine" hiện có
// (xem admin/config.yml trước khi bị disable, và migrate_rev11_magazine.sql):
// cover_image, cover_story (slug bài viết), editors_note, month, year,
// status. KHÔNG có Volume/Featured Issue/SEO riêng trong dữ liệu gốc — Issue
// nổi bật luôn tự động là issue mới nhất (scripts/magazine.py:latest_issue()),
// SEO (title/description trang Issue) tự sinh từ Issue Number + editors_note
// (build.py:render_magazine_issue_page()), không phải field rời để sửa tay.
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const EMPTY_FORM = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  cover_image_url: "",
  cover_story_slug: "",
  editors_note: "",
  status: "draft",
};

// Issue Number không lưu ở DB — scripts/magazine.py tính lại mỗi lần build
// theo thứ tự (year, month) tăng dần trong các issue published. Mô phỏng
// đúng thuật toán đó ở đây chỉ để HIỂN THỊ (không ghi ngược vào DB).
function computeIssueNumbers(issues) {
  const published = issues
    .filter((i) => i.status === "published" && !i.deleted_at)
    .slice()
    .sort((a, b) => (a.year - b.year) || (a.month - b.month) || a.slug.localeCompare(b.slug));
  const map = new Map();
  published.forEach((i, idx) => map.set(i.id, idx + 1));
  return map;
}

export default function MagazineManager() {
  const [issues, setIssues] = useState([]);
  const [articles, setArticles] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let query = supabase
      .from("magazine_issues")
      .select("id, slug, cover_image_url, cover_story_slug, editors_note, month, year, status, deleted_at")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setIssues([]);
    } else {
      setIssues(data);
    }
    setLoading(false);
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    supabase
      .from("articles")
      .select("slug, title")
      .is("deleted_at", null)
      .order("title")
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setArticles(data || []);
      });
  }, []);

  const issueNumbers = useMemo(() => computeIssueNumbers(issues), [issues]);

  const visibleIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = `${i.year}-${i.month} ${i.editors_note || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [issues, statusFilter, search]);

  async function editRow(id) {
    const { data, error: err } = await supabase.from("magazine_issues").select("*").eq("id", id).maybeSingle();
    if (err || !data) return alert(err?.message || "Không tìm thấy số báo.");
    setEditingId(id);
    setForm({
      year: data.year,
      month: data.month,
      cover_image_url: data.cover_image_url || "",
      cover_story_slug: data.cover_story_slug || "",
      editors_note: data.editors_note || "",
      status: data.status,
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(EMPTY_FORM);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  // Cảnh báo mềm — không chặn, giữ đúng hành vi hiện có: build_issues() đã
  // tự loại issue trùng Tháng/Năm (giữ 1, in cảnh báo) thay vì lỗi cứng.
  const duplicatePeriod = issues.some(
    (i) => i.id !== editingId && !i.deleted_at && i.year === Number(form.year) && i.month === Number(form.month)
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const payload = {
      slug: `${form.year}-${form.month}`,
      year: Number(form.year),
      month: Number(form.month),
      cover_image_url: form.cover_image_url || null,
      cover_story_slug: form.cover_story_slug || null,
      editors_note: form.editors_note.trim() || null,
      status: form.status,
    };
    setSaving(true);
    const query =
      editingId === "new"
        ? supabase.from("magazine_issues").insert(payload)
        : supabase.from("magazine_issues").update(payload).eq("id", editingId);
    const { error: err } = await query;
    setSaving(false);
    if (err) return setError(err.message);
    cancelEdit();
    load();
  }

  async function toggleStatus(issue) {
    const next = issue.status === "published" ? "draft" : "published";
    const { error: err } = await supabase.from("magazine_issues").update({ status: next }).eq("id", issue.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  async function toggleDeleted(issue) {
    const next = issue.deleted_at ? null : new Date().toISOString();
    const { error: err } = await supabase.from("magazine_issues").update({ deleted_at: next }).eq("id", issue.id);
    if (err) return alert(`Không thực hiện được: ${err.message}`);
    load();
  }

  const previewCoverStory = articles.find((a) => a.slug === form.cover_story_slug);

  return (
    <div className="page">
      <div className="page__header">
        <h1>TNC Magazine</h1>
        {editingId === null && (
          <button className="btn btn--solid" onClick={startNew}>
            + Số báo mới
          </button>
        )}
      </div>
      <p className="muted small">
        Mỗi số báo tự động gộp toàn bộ bài viết có Ngày đăng rơi vào đúng Tháng/Năm bên dưới — không chọn bài thủ công
        (đúng hành vi hiện có). Issue Number tự tính khi build theo thứ tự Tháng/Năm, không sửa được ở đây.
      </p>

      {editingId !== null && (
        <form className="form" onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
          <div className="form-grid">
            <label>
              Tháng
              <select value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Năm
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              />
            </label>
          </div>
          {duplicatePeriod && (
            <p className="field-error">
              Đã có số báo khác cùng Tháng/Năm này — build.py sẽ chỉ giữ lại 1 số, số còn lại bị bỏ qua.
            </p>
          )}

          <ImageUploader
            label="Ảnh bìa"
            value={form.cover_image_url}
            onChange={(url) => setForm((f) => ({ ...f, cover_image_url: url }))}
            pathPrefix="magazine/cover"
          />

          <label>
            Cover Story (bài viết nổi bật của số báo) *
            <select
              value={form.cover_story_slug}
              onChange={(e) => setForm((f) => ({ ...f, cover_story_slug: e.target.value }))}
              required
            >
              <option value="">— Chọn bài viết —</option>
              {articles.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>

          <label>
            Lời toà soạn (tuỳ chọn)
            <textarea
              rows={3}
              value={form.editors_note}
              onChange={(e) => setForm((f) => ({ ...f, editors_note: e.target.value }))}
            />
          </label>

          <label>
            Trạng thái
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="draft">Nháp (chưa công khai)</option>
              <option value="published">Đã xuất bản</option>
            </select>
          </label>

          {error && <p className="field-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
              Huỷ
            </button>
            <button type="submit" className="btn btn--solid" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>

          <h2 style={{ fontSize: "1rem", marginTop: 24 }}>Xem trước</h2>
          <div className="tnc-selects__preview">
            <div className="tnc-selects__preview-row">
              {form.cover_image_url && (
                <span className="tnc-selects__thumb">
                  <img src={form.cover_image_url} alt="" />
                </span>
              )}
              <span>
                <strong>Tháng {form.month}, {form.year}</strong>
                <br />
                <span className="muted small">
                  Cover Story: {previewCoverStory ? previewCoverStory.title : "(chưa chọn)"}
                </span>
              </span>
            </div>
            {form.editors_note && <p className="muted small">{form.editors_note}</p>}
          </div>
        </form>
      )}

      <div className="toolbar">
        <input
          type="search"
          aria-label="Tìm theo tháng/năm hoặc lời toà soạn"
          placeholder="Tìm theo tháng-năm hoặc lời toà soạn…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 260 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="published">Đã xuất bản</option>
        </select>
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả số báo đã xoá
        </label>
      </div>

      {error && editingId === null && <p className="field-error">{error}</p>}
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Bìa</th>
              <th>Issue #</th>
              <th>Tháng/Năm</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleIssues.map((i) => (
              <tr key={i.id} className={i.deleted_at ? "is-deleted" : ""}>
                <td>
                  {i.cover_image_url && (
                    <img src={i.cover_image_url} alt="" style={{ width: 40, height: 52, objectFit: "cover" }} />
                  )}
                </td>
                <td>{issueNumbers.has(i.id) ? `#${String(issueNumbers.get(i.id)).padStart(3, "0")}` : "—"}</td>
                <td>Tháng {i.month}, {i.year}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleStatus(i)}>
                    {i.status === "published" ? "Đã xuất bản" : "Nháp"}
                  </button>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => editRow(i.id)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => toggleDeleted(i)}>
                    {i.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {visibleIssues.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Không có số báo nào khớp bộ lọc hiện tại.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
