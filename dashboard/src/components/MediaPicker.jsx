import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Chọn 1 ảnh đã có trong Media Library (M1), hoặc upload ảnh mới — cả 2
// đường đều kết thúc bằng 1 media.id thật, dùng cho các cột *_media_id
// (site_settings, footer_partners...). Không tạo hệ thống upload riêng —
// tái dùng đúng bucket Storage "media" đã có từ Rev 5.
//
// allowedTypes: media.type được liệt kê trong <select> + type gán khi
// quick-upload — mặc định chỉ "image" (hành vi gốc, không đổi cho các nơi
// gọi hiện có). Truyền thêm "gif" (vd Author Medals, Rev 16) để chọn/tải
// được ảnh GIF thật (media.type='gif', khác 'image' — xem MediaForm.jsx) và
// giữ hoạt ảnh khi render công khai (build.py in thẳng <img src>, không
// convert/resize).
export default function MediaPicker({ label, mediaId, onChange, allowedTypes = ["image"] }) {
  const [options, setOptions] = useState([]);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const selectId = useId();

  useEffect(() => {
    supabase
      .from("media")
      .select("id, url, caption")
      .in("type", allowedTypes)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        // Bug fix (production audit): trước đây không bắt error — nếu lỗi,
        // <select> chọn ảnh chỉ còn "— Không có —" mà không cảnh báo gì.
        if (err) setError(err.message);
        else setOptions(data || []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTypes.join(",")]);

  useEffect(() => {
    const match = options.find((o) => o.id === mediaId);
    setPreview(match?.url || "");
  }, [mediaId, options]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Chỉ chấp nhận ảnh JPEG, PNG, WEBP hoặc GIF.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Ảnh vượt quá dung lượng cho phép (10MB).");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `media/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      setUploading(false);
      setError(`Upload thất bại: ${uploadError.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
    const mediaType = file.type === "image/gif" && allowedTypes.includes("gif") ? "gif" : "image";
    const { data: row, error: insertError } = await supabase
      .from("media")
      .insert({ url: pub.publicUrl, type: mediaType })
      .select("id, url, caption")
      .single();
    setUploading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOptions((prev) => [row, ...prev]);
    onChange(row.id);
  }

  return (
    <div className="image-uploader">
      <label className="field-label" htmlFor={selectId}>{label}</label>
      {preview && (
        <div className="image-uploader__preview">
          <img src={preview} alt="" />
        </div>
      )}
      <select id={selectId} value={mediaId || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">— Không có —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.caption || o.url}
          </option>
        ))}
      </select>
      <div className="image-uploader__actions">
        <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Đang tải lên…" : "Upload ảnh mới"}
        </button>
      </div>
      <input ref={inputRef} type="file" accept={ALLOWED_TYPES.join(",")} hidden onChange={handleFileChange} />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
