import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import MediaPicker from "../components/MediaPicker";

const EMPTY_SETTINGS = { description: "", copyright_text: "" };
const EMPTY_PARTNER = { name: "", link_url: "", logo_media_id: null, sort_order: 0 };

export default function FooterBuilder() {
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  const [partners, setPartners] = useState([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER);
  const [editingId, setEditingId] = useState(null);
  const [partnerError, setPartnerError] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("footer_settings").select("*").eq("id", true).maybeSingle();
      if (data) setSettings({ description: data.description || "", copyright_text: data.copyright_text || "" });
      setLoadingSettings(false);
    }
    load();
  }, []);

  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    let query = supabase
      .from("footer_partners")
      .select("id, name, link_url, logo_media_id, sort_order, is_active, deleted_at, logo:logo_media_id(url)")
      .order("sort_order");
    if (!showDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query;
    if (!error) setPartners(data || []);
    setLoadingPartners(false);
  }, [showDeleted]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  async function handleSettingsSubmit(e) {
    e.preventDefault();
    setSettingsError("");
    setSavingSettings(true);
    const { error } = await supabase
      .from("footer_settings")
      .upsert({ id: true, description: settings.description.trim() || null, copyright_text: settings.copyright_text.trim() || null }, { onConflict: "id" });
    setSavingSettings(false);
    if (error) return setSettingsError(error.message);
    setSettingsSaved(true);
  }

  function startEditPartner(p) {
    setEditingId(p.id);
    setPartnerForm({ name: p.name, link_url: p.link_url || "", logo_media_id: p.logo_media_id, sort_order: p.sort_order });
  }

  function startNewPartner() {
    setEditingId("new");
    setPartnerForm({ ...EMPTY_PARTNER, sort_order: partners.length });
  }

  function cancelPartnerEdit() {
    setEditingId(null);
    setPartnerForm(EMPTY_PARTNER);
    setPartnerError("");
  }

  async function handlePartnerSubmit(e) {
    e.preventDefault();
    setPartnerError("");
    if (!partnerForm.name.trim()) {
      setPartnerError("Tên đối tác là bắt buộc.");
      return;
    }
    const payload = {
      name: partnerForm.name.trim(),
      link_url: partnerForm.link_url.trim() || null,
      logo_media_id: partnerForm.logo_media_id || null,
      sort_order: Number(partnerForm.sort_order) || 0,
    };
    const query =
      editingId === "new"
        ? supabase.from("footer_partners").insert(payload)
        : supabase.from("footer_partners").update(payload).eq("id", editingId);
    const { error } = await query;
    if (error) return setPartnerError(error.message);
    cancelPartnerEdit();
    loadPartners();
  }

  async function togglePartnerDeleted(p) {
    const next = p.deleted_at ? null : new Date().toISOString();
    const { error } = await supabase.from("footer_partners").update({ deleted_at: next }).eq("id", p.id);
    if (error) return alert(`Không thực hiện được: ${error.message}`);
    loadPartners();
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Footer Builder</h1>
      </div>

      <h2 style={{ fontSize: "1.1rem" }}>Nội dung chân trang</h2>
      {loadingSettings ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <form className="form" onSubmit={handleSettingsSubmit} style={{ marginBottom: 30 }}>
          <label>
            Mô tả thương hiệu
            <textarea
              rows={3}
              value={settings.description}
              onChange={(e) => {
                setSettings((s) => ({ ...s, description: e.target.value }));
                setSettingsSaved(false);
              }}
            />
          </label>
          <label>
            Dòng bản quyền
            <input
              value={settings.copyright_text}
              onChange={(e) => {
                setSettings((s) => ({ ...s, copyright_text: e.target.value }));
                setSettingsSaved(false);
              }}
            />
          </label>
          {settingsError && <p className="field-error">{settingsError}</p>}
          {settingsSaved && <p className="muted small">Đã lưu.</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn--solid" disabled={savingSettings}>
              {savingSettings ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      )}

      <p className="muted small">
        Các cột liên kết chân trang (Khám phá / Series chính / Tổ chức) hiện quản lý qua <strong>Menu Builder</strong> —
        chọn menu "Menu chân trang". Trang này chỉ quản lý text thương hiệu và Đối tác/Nhà tài trợ.
      </p>

      <div className="page__header">
        <h2 style={{ fontSize: "1.1rem" }}>Đối tác / Nhà tài trợ</h2>
        {editingId === null && (
          <button className="btn btn--solid btn--sm" onClick={startNewPartner}>
            + Đối tác mới
          </button>
        )}
      </div>

      {editingId !== null && (
        <form className="form" onSubmit={handlePartnerSubmit} style={{ marginBottom: 20 }}>
          <label>
            Tên đối tác *
            <input value={partnerForm.name} onChange={(e) => setPartnerForm((f) => ({ ...f, name: e.target.value }))} required />
          </label>
          <label>
            Link
            <input value={partnerForm.link_url} onChange={(e) => setPartnerForm((f) => ({ ...f, link_url: e.target.value }))} />
          </label>
          <MediaPicker
            label="Logo"
            mediaId={partnerForm.logo_media_id}
            onChange={(id) => setPartnerForm((f) => ({ ...f, logo_media_id: id }))}
          />
          <label>
            Thứ tự
            <input
              type="number"
              value={partnerForm.sort_order}
              onChange={(e) => setPartnerForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
          </label>
          {partnerError && <p className="field-error">{partnerError}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={cancelPartnerEdit}>
              Huỷ
            </button>
            <button type="submit" className="btn btn--solid">
              Lưu
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <label className="checkbox-inline">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Hiện cả đối tác đã xoá
        </label>
      </div>

      {loadingPartners ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Logo</th>
              <th>Tên</th>
              <th>Link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className={p.deleted_at ? "is-deleted" : ""}>
                <td>{p.logo?.url && <img src={p.logo.url} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />}</td>
                <td>{p.name}</td>
                <td className="muted small">{p.link_url || "—"}</td>
                <td>
                  <button className="btn btn--ghost btn--sm" onClick={() => startEditPartner(p)}>
                    Sửa
                  </button>{" "}
                  <button className="btn btn--ghost btn--sm" onClick={() => togglePartnerDeleted(p)}>
                    {p.deleted_at ? "Khôi phục" : "Xoá"}
                  </button>
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Chưa có đối tác nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
