import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../auth/AuthContext";
import { loadTypesForSelect } from "../../lib/assetsData";

function emptyTerm(sortOrder) {
  return { _key: crypto.randomUUID(), id: null, label: "", source: "field", field_path: "", constant_value: "", weight: 1, sort_order: sortOrder };
}

// "Công thức tính" (PHẦN VIII spec) — công thức sống TRONG DATABASE
// (valuation_formulas + valuation_formula_terms), Engine đọc rồi tính, đây
// chỉ là UI CRUD cho các dòng đó. Mỗi dòng (term) là 1 số hạng trong tổng
// có trọng số: "Giá trị cơ bản" | "Điểm X" (đọc field trong metrics của
// tài sản) | "Hằng số". Sửa xong Lưu -> Engine tự tính lại NGAY cho mọi
// tài sản thuộc loại này (trigger AFTER trên valuation_formula_terms).
export default function AssetFormulas() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("assets.edit") || hasPermission("assets.create");

  const [types, setTypes] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [formulaId, setFormulaId] = useState(null);
  const [formulaName, setFormulaName] = useState("");
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTypesForSelect().then((data) => {
      setTypes(data);
      if (data.length > 0) setSelectedTypeId(data[0].id);
      setLoading(false);
    });
  }, []);

  const loadFormula = useCallback(async (typeId) => {
    if (!typeId) return;
    setLoading(true);
    setError("");
    setSaved(false);
    const { data: formula, error: fErr } = await supabase
      .from("valuation_formulas")
      .select("*")
      .eq("asset_type_id", typeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (fErr) {
      setError(fErr.message);
      setLoading(false);
      return;
    }
    if (!formula) {
      setFormulaId(null);
      const typeName = types.find((t) => t.id === typeId)?.name || "";
      setFormulaName(`Công thức ${typeName}`);
      setTerms([emptyTerm(10)]);
      setLoading(false);
      return;
    }
    setFormulaId(formula.id);
    setFormulaName(formula.name);
    const { data: termRows, error: tErr } = await supabase
      .from("valuation_formula_terms")
      .select("*")
      .eq("formula_id", formula.id)
      .order("sort_order");
    if (tErr) {
      setError(tErr.message);
    } else {
      setTerms(
        (termRows.length ? termRows : [{}]).map((t, i) => ({
          _key: t.id || crypto.randomUUID(),
          id: t.id || null,
          label: t.label || "",
          source: t.source || "field",
          field_path: t.field_path || "",
          constant_value: t.constant_value ?? "",
          weight: t.weight ?? 1,
          sort_order: t.sort_order ?? (i + 1) * 10,
        }))
      );
    }
    setLoading(false);
  }, [types]);

  useEffect(() => {
    if (selectedTypeId) loadFormula(selectedTypeId);
  }, [selectedTypeId, loadFormula]);

  function updateTerm(key, patch) {
    setTerms((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }
  function addTerm() {
    setTerms((rows) => [...rows, emptyTerm((rows.length + 1) * 10)]);
  }
  function removeTerm(key) {
    setTerms((rows) => rows.filter((r) => r._key !== key));
  }

  async function handleSave() {
    setError("");
    setSaved(false);
    const cleanTerms = terms.filter((t) => t.label.trim());
    if (!formulaName.trim() || cleanTerms.length === 0) {
      setError("Tên công thức và ít nhất 1 dòng công thức (có Nhãn) là bắt buộc.");
      return;
    }
    for (const t of cleanTerms) {
      if (t.source === "field" && !t.field_path.trim()) {
        setError(`Dòng "${t.label}" chọn nguồn "Điểm/Field" phải nhập tên field.`);
        return;
      }
      if (t.source === "constant" && t.constant_value === "") {
        setError(`Dòng "${t.label}" chọn nguồn "Hằng số" phải nhập giá trị.`);
        return;
      }
    }
    setSaving(true);
    let fId = formulaId;
    if (!fId) {
      const { data, error: err } = await supabase
        .from("valuation_formulas")
        .insert({ asset_type_id: selectedTypeId, name: formulaName.trim() })
        .select("id")
        .single();
      if (err) {
        setSaving(false);
        return setError(err.message);
      }
      fId = data.id;
      setFormulaId(fId);
    } else {
      const { error: err } = await supabase.from("valuation_formulas").update({ name: formulaName.trim() }).eq("id", fId);
      if (err) {
        setSaving(false);
        return setError(err.message);
      }
    }

    // Ghi lại toàn bộ term: xoá term cũ không còn trong danh sách, upsert phần còn lại.
    const { data: existingRows } = await supabase.from("valuation_formula_terms").select("id").eq("formula_id", fId);
    const keepIds = new Set(cleanTerms.filter((t) => t.id).map((t) => t.id));
    const toDelete = (existingRows || []).filter((r) => !keepIds.has(r.id)).map((r) => r.id);
    if (toDelete.length) {
      await supabase.from("valuation_formula_terms").delete().in("id", toDelete);
    }
    for (const t of cleanTerms) {
      const payload = {
        formula_id: fId,
        label: t.label.trim(),
        source: t.source,
        field_path: t.source === "field" ? t.field_path.trim() : null,
        constant_value: t.source === "constant" ? Number(t.constant_value) : null,
        weight: Number(t.weight) || 1,
        sort_order: Number(t.sort_order) || 0,
      };
      if (t.id) {
        await supabase.from("valuation_formula_terms").update(payload).eq("id", t.id);
      } else {
        await supabase.from("valuation_formula_terms").insert(payload);
      }
    }
    setSaving(false);
    setSaved(true);
    loadFormula(selectedTypeId);
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Công thức tính</h1>
      </div>
      <p className="muted small">
        Công thức = tổng có trọng số các dòng dưới đây. Ví dụ "Bài viết = Giá trị cơ bản + Điểm SEO × 1000 + Điểm nổi
        bật × 2000" — "Điểm SEO"/"Điểm nổi bật" là field trong dữ liệu đầu vào (metrics) của từng tài sản, nhập ở Sổ
        tài sản.
      </p>

      <label style={{ maxWidth: 420, display: "block", marginBottom: 20 }}>
        Loại tài sản
        <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.asset_categories?.name})
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div style={{ maxWidth: 900 }}>
          <label style={{ maxWidth: 420, display: "block" }}>
            Tên công thức
            <input value={formulaName} onChange={(e) => setFormulaName(e.target.value)} disabled={!canEdit} />
          </label>

          <div className="asset-formula-terms" style={{ marginTop: 16 }}>
            <div className="asset-formula-term muted small">
              <span>Nhãn</span>
              <span>Nguồn</span>
              <span>Field / Giá trị hằng số</span>
              <span>Trọng số</span>
              <span></span>
            </div>
            {terms.map((t) => (
              <div className="asset-formula-term" key={t._key}>
                <input
                  placeholder="vd: Điểm SEO"
                  value={t.label}
                  onChange={(e) => updateTerm(t._key, { label: e.target.value })}
                  disabled={!canEdit}
                />
                <select value={t.source} onChange={(e) => updateTerm(t._key, { source: e.target.value })} disabled={!canEdit}>
                  <option value="base_value">Giá trị cơ bản</option>
                  <option value="field">Điểm / Field</option>
                  <option value="constant">Hằng số</option>
                </select>
                {t.source === "field" && (
                  <input
                    placeholder="vd: seo_score"
                    value={t.field_path}
                    onChange={(e) => updateTerm(t._key, { field_path: e.target.value })}
                    disabled={!canEdit}
                  />
                )}
                {t.source === "constant" && (
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Giá trị"
                    value={t.constant_value}
                    onChange={(e) => updateTerm(t._key, { constant_value: e.target.value })}
                    disabled={!canEdit}
                  />
                )}
                {t.source === "base_value" && <span className="muted small">— (không cần nhập)</span>}
                <input
                  type="number"
                  step="0.0001"
                  value={t.weight}
                  onChange={(e) => updateTerm(t._key, { weight: e.target.value })}
                  disabled={!canEdit}
                />
                {canEdit && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeTerm(t._key)}>
                    Xoá dòng
                  </button>
                )}
              </div>
            ))}
          </div>

          {canEdit && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={addTerm} style={{ marginBottom: 16 }}>
              + Thêm dòng công thức
            </button>
          )}

          {error && <p className="field-error">{error}</p>}
          {saved && <p className="muted small">Đã lưu — Engine đã tính lại xong cho mọi tài sản thuộc loại này.</p>}
          {canEdit && (
            <div className="form-actions">
              <button type="button" className="btn btn--solid" disabled={saving} onClick={handleSave}>
                {saving ? "Đang lưu…" : "Lưu công thức"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
