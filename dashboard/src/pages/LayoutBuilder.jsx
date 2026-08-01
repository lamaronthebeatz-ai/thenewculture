import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import DynamicBlockConfigForm from "../components/DynamicBlockConfigForm";

// Khớp SITE_URL trong scripts/build.py — Dashboard và build.py là 2 hệ
// thống tách biệt (không có cấu hình dùng chung), đổi domain thật thì sửa
// cả 2 nơi.
const SITE_URL = "https://thenewculture.pages.dev";

const VISIBILITY_LABELS = { all: "Mọi thiết bị", desktop: "Chỉ Desktop", mobile: "Chỉ Mobile", hidden: "Ẩn" };
const CONDITION_LABELS = {
  always: "Luôn hiển thị",
  manual_toggle: "Bật/Tắt thủ công",
  date_range: "Theo khoảng thời gian",
  has_content: "Khi có nội dung",
  has_promotion: "Khi có Khuyến mãi",
  has_magazine_issue: "Khi có Tạp chí mới",
  has_membership: "Khi có Membership",
};

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(local) {
  if (!local) return null;
  return new Date(local).toISOString();
}

// Rev 17 (Phase 5) — Layout Builder / Bố cục Website. Dùng chung cho cả
// "Bố cục Trang chủ" (pageKey cố định "homepage", route /layout/homepage)
// lẫn "Bố cục Trang" khác (pageKey động từ URL, route /layout/pages/:pageKey)
// — 1 component, không nhân đôi logic. build.py hiện CHỈ đọc bố cục cho
// page_key="homepage" (xem BLOCK_RENDERERS/render_homepage_blocks trong
// build.py) — bố cục trang khác lưu được ở đây nhưng chưa có nơi build.py
// dùng tới, để dành Phase sau (xem báo cáo).
export default function LayoutBuilder({ fixedPageKey }) {
  const params = useParams();
  const pageKey = fixedPageKey || params.pageKey;

  const { hasPermission } = useAuth();
  const canEdit = hasPermission("layout.edit");
  const canCreate = hasPermission("layout.create");
  const canDelete = hasPermission("layout.delete");

  const [blockTypes, setBlockTypes] = useState([]);
  const [layout, setLayout] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addSelection, setAddSelection] = useState("");
  const [expandedConfigId, setExpandedConfigId] = useState(null);
  const [expandedScheduleId, setExpandedScheduleId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [typesRes, layoutRes] = await Promise.all([
      supabase
        .from("layout_block_types")
        .select("key, label, description, config_schema, is_active")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("page_layouts").select("id, page_key, name, is_active").eq("page_key", pageKey).is("deleted_at", null).maybeSingle(),
    ]);
    if (typesRes.error) setError(typesRes.error.message);
    setBlockTypes(typesRes.data || []);

    if (layoutRes.error) {
      setError(layoutRes.error.message);
      setLoading(false);
      return;
    }
    setLayout(layoutRes.data || null);
    if (!layoutRes.data) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    const blocksRes = await supabase
      .from("layout_blocks")
      .select("*")
      .eq("page_layout_id", layoutRes.data.id)
      .is("deleted_at", null)
      .order("sort_order");
    if (blocksRes.error) setError(blocksRes.error.message);
    setBlocks(blocksRes.data || []);
    setLoading(false);
  }, [pageKey]);

  useEffect(() => {
    load();
  }, [load]);

  const blockTypeByKey = Object.fromEntries(blockTypes.map((t) => [t.key, t]));

  async function createLayout() {
    setBusy(true);
    setError("");
    const name = pageKey === "homepage" ? "Bố cục Trang chủ" : pageKey;
    const { data, error: err } = await supabase
      .from("page_layouts")
      .insert({ page_key: pageKey, name })
      .select("id, page_key, name, is_active")
      .single();
    setBusy(false);
    if (err) return setError(err.message);
    setLayout(data);
  }

  function nextSortOrder() {
    return blocks.length ? Math.max(...blocks.map((b) => b.sort_order)) + 10 : 10;
  }

  async function addBlock() {
    if (!addSelection || !layout) return;
    setBusy(true);
    const { error: err } = await supabase.from("layout_blocks").insert({
      page_layout_id: layout.id,
      block_type_key: addSelection,
      sort_order: nextSortOrder(),
    });
    setBusy(false);
    if (err) return setError(err.message);
    setAddSelection("");
    load();
  }

  async function duplicateBlock(block) {
    setBusy(true);
    const { error: err } = await supabase.from("layout_blocks").insert({
      page_layout_id: layout.id,
      block_type_key: block.block_type_key,
      sort_order: nextSortOrder(),
      is_enabled: block.is_enabled,
      visibility: block.visibility,
      visibility_condition: block.visibility_condition,
      starts_at: block.starts_at,
      ends_at: block.ends_at,
      priority: block.priority,
      config: block.config,
    });
    setBusy(false);
    if (err) return setError(err.message);
    load();
  }

  async function removeBlock(block) {
    if (!confirm(`Xoá khối "${blockTypeByKey[block.block_type_key]?.label || block.block_type_key}" khỏi bố cục?`)) return;
    setBusy(true);
    const { error: err } = await supabase.from("layout_blocks").delete().eq("id", block.id);
    setBusy(false);
    if (err) return setError(err.message);
    load();
  }

  async function patchBlock(id, patch) {
    const { error: err } = await supabase.from("layout_blocks").update(patch).eq("id", id);
    if (err) {
      setError(err.message);
      return false;
    }
    return true;
  }

  async function toggleEnabled(block) {
    if (await patchBlock(block.id, { is_enabled: !block.is_enabled })) load();
  }

  async function changeVisibility(block, visibility) {
    if (await patchBlock(block.id, { visibility })) load();
  }

  async function saveConfig(block, config) {
    setBusy(true);
    const ok = await patchBlock(block.id, { config });
    setBusy(false);
    if (ok) load();
  }

  async function saveSchedule(block, patch) {
    setBusy(true);
    const ok = await patchBlock(block.id, patch);
    setBusy(false);
    if (ok) load();
  }

  async function persistOrder(nextBlocks) {
    setBusy(true);
    const updates = nextBlocks.map((b, i) => supabase.from("layout_blocks").update({ sort_order: (i + 1) * 10 }).eq("id", b.id));
    await Promise.all(updates);
    setBusy(false);
    load();
  }

  function move(index, direction) {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  }

  function onDragStart(index) {
    setDragIndex(index);
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  function onDrop(index) {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setDragIndex(null);
    persistOrder(next);
  }

  if (loading) return <div className="page">Đang tải…</div>;

  return (
    <div className="page">
      <div className="page__header">
        <h1>{pageKey === "homepage" ? "Bố cục Trang chủ" : `Bố cục Trang — ${pageKey}`}</h1>
        {pageKey === "homepage" && (
          <a className="btn btn--ghost" href={`${SITE_URL}/index.html`} target="_blank" rel="noopener">
            Xem trước ↗
          </a>
        )}
      </div>

      {error && <p className="field-error">{error}</p>}

      {!layout ? (
        <div className="empty-state">
          <p className="muted">Trang này chưa có Bố cục — website đang render theo bố cục mặc định có sẵn (không đổi gì).</p>
          {canCreate && (
            <button className="btn btn--solid" disabled={busy} onClick={createLayout}>
              Tạo Bố cục cho trang này
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="muted small">
            Kéo thả hoặc dùng nút ↑↓ để đổi thứ tự. Khối bị Tắt hoặc Ẩn sẽ không hiển thị trên website. Thay đổi áp dụng
            ngay lần build tiếp theo.
          </p>

          <ul className="layout-block-list">
            {blocks.map((block, index) => {
              const type = blockTypeByKey[block.block_type_key];
              const hasConfig = type && (type.config_schema || []).length > 0;
              return (
                <li
                  key={block.id}
                  className={`layout-block-row${block.is_enabled ? "" : " is-disabled"}`}
                  draggable={canEdit}
                  onDragStart={() => onDragStart(index)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(index)}
                >
                  <div className="layout-block-row__main">
                    <span className="layout-block-row__handle" aria-hidden="true">
                      ⠿
                    </span>
                    <div className="layout-block-row__info">
                      <span className="layout-block-row__label">{type?.label || block.block_type_key}</span>
                      {!type && <span className="badge badge--deleted">Chưa có renderer</span>}
                      {type?.description && <span className="muted small">{type.description}</span>}
                    </div>
                    <select
                      value={block.visibility}
                      disabled={!canEdit || busy}
                      onChange={(e) => changeVisibility(block, e.target.value)}
                      aria-label="Hiển thị"
                    >
                      {Object.entries(VISIBILITY_LABELS).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn--ghost btn--sm" disabled={!canEdit || busy} onClick={() => toggleEnabled(block)}>
                      {block.is_enabled ? "Bật" : "Tắt"}
                    </button>
                    <button className="btn btn--ghost btn--sm" disabled={index === 0 || busy} onClick={() => move(index, "up")} aria-label="Lên trên">
                      ↑
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      disabled={index === blocks.length - 1 || busy}
                      onClick={() => move(index, "down")}
                      aria-label="Xuống dưới"
                    >
                      ↓
                    </button>
                    {hasConfig && canEdit && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setExpandedConfigId(expandedConfigId === block.id ? null : block.id)}
                      >
                        Cấu hình
                      </button>
                    )}
                    {canEdit && (
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => setExpandedScheduleId(expandedScheduleId === block.id ? null : block.id)}
                      >
                        Lịch chạy
                      </button>
                    )}
                    {canCreate && (
                      <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => duplicateBlock(block)}>
                        Nhân bản
                      </button>
                    )}
                    {canDelete && (
                      <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => removeBlock(block)}>
                        Xoá
                      </button>
                    )}
                  </div>

                  {expandedConfigId === block.id && hasConfig && (
                    <div className="layout-block-row__panel">
                      <DynamicBlockConfigForm
                        schema={type.config_schema}
                        value={block.config || {}}
                        onChange={(config) => saveConfig(block, config)}
                      />
                    </div>
                  )}

                  {expandedScheduleId === block.id && (
                    <div className="layout-block-row__panel">
                      <div className="form-grid form-grid--3">
                        <label>
                          Điều kiện hiển thị
                          <select
                            value={block.visibility_condition}
                            onChange={(e) => saveSchedule(block, { visibility_condition: e.target.value })}
                          >
                            {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Bắt đầu
                          <input
                            type="datetime-local"
                            value={toLocalInput(block.starts_at)}
                            onChange={(e) => saveSchedule(block, { starts_at: fromLocalInput(e.target.value) })}
                          />
                        </label>
                        <label>
                          Kết thúc
                          <input
                            type="datetime-local"
                            value={toLocalInput(block.ends_at)}
                            onChange={(e) => saveSchedule(block, { ends_at: fromLocalInput(e.target.value) })}
                          />
                        </label>
                      </div>
                      <p className="muted small">
                        "Theo khoảng thời gian" chỉ hiển thị khối trong khoảng Bắt đầu–Kết thúc. Các điều kiện khác tự
                        động ẩn khối nếu không có dữ liệu tương ứng (vd chưa có Khuyến mãi đang chạy), không cần cấu
                        hình thêm.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
            {blocks.length === 0 && <li className="muted">Chưa có khối nào — bố cục đang trống, thêm khối bên dưới.</li>}
          </ul>

          {canCreate && (
            <div className="layout-block-add">
              <select value={addSelection} onChange={(e) => setAddSelection(e.target.value)}>
                <option value="">— Chọn loại khối —</option>
                {blockTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button className="btn btn--solid" disabled={!addSelection || busy} onClick={addBlock}>
                + Thêm Khối
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
