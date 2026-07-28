import { useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // khớp file_size_limit của bucket "media" (Rev 5)

export default function ImageUploader({ label, value, onChange, pathPrefix }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng 1 file sau này
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
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, file, { upsert: false, contentType: file.type });
    setUploading(false);

    if (uploadError) {
      setError(`Upload thất bại: ${uploadError.message}`);
      return;
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    onChange(data.publicUrl);
  }

  return (
    <div className="image-uploader">
      <label className="field-label">{label}</label>
      {value ? (
        <div className="image-uploader__preview">
          <img src={value} alt="" />
        </div>
      ) : null}
      <input
        type="text"
        placeholder="URL ảnh (hoặc upload bên dưới)"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="image-uploader__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Đang tải lên…" : "Tải ảnh lên"}
        </button>
        {value && (
          <button type="button" className="btn btn--ghost" onClick={() => onChange("")}>
            Xoá
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        hidden
        onChange={handleFileChange}
      />
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
