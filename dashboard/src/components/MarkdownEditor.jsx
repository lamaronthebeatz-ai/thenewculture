import { useCallback, useRef, useState } from "react";
import { markdownToHtml } from "../lib/markdownPreview";

// Trình soạn Markdown "chuyên nghiệp" cho Nội dung bài viết — thanh công cụ
// chèn cú pháp Markdown chuẩn (Bold/Italic/Gạch ngang/Tiêu đề/Trích dẫn/Mã/
// Danh sách/Liên kết/Ảnh/Đường kẻ ngang/Bảng) + phím tắt (Ctrl+B/I/K) + Xem
// trước trực tiếp. Vẫn là 1 <textarea> Markdown thuần bên dưới (KHÔNG phải
// WYSIWYG/contenteditable) — build.py (Python "markdown") vẫn là nguồn xử
// lý DUY NHẤT khi xuất bản lên site thật; bản Xem trước ở đây chỉ là công
// cụ hỗ trợ biên tập, dùng 1 trình dịch Markdown->HTML tối giản tự viết
// (lib/markdownPreview.js), không thêm thư viện ngoài.
//
// Cách chèn cú pháp: thao tác trực tiếp trên vùng chọn (selectionStart/End)
// của textarea DOM thật qua ref — không dùng contenteditable/execCommand
// (đã bị trình duyệt khai tử dần), an toàn và tương thích mọi trình duyệt.

function getLineRange(value, start, end) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  return { lineStart, lineEnd };
}

export default function MarkdownEditor({ value, onChange, rows = 14, placeholder }) {
  const textareaRef = useRef(null);
  const [mode, setMode] = useState("write"); // "write" | "preview"

  // Cố ý ghi trực tiếp vào DOM (el.value/setSelectionRange) TRƯỚC khi gọi
  // onChange, thay vì chỉ setState rồi đợi React render lại. Lý do: nếu 2
  // thao tác toolbar bấm liên tiếp nhanh hơn 1 khung hình (vd double-click
  // nhầm, hoặc thao tác tự động hoá), thao tác sau có thể đọc lại
  // el.value/selectionStart|End của lần render TRƯỚC (chưa kịp cập nhật),
  // tính sai vị trí chèn cú pháp Markdown (dấu ** bị nhân đôi...). Ghi DOM
  // đồng bộ trước rồi mới onChange() đảm bảo mọi thao tác kế tiếp luôn đọc
  // đúng trạng thái mới nhất — đây là kỹ thuật chuẩn cho input có điều
  // khiển (controlled) cần thao tác trực tiếp lên selection, React tự nhận
  // biết DOM đã khớp giá trị mới khi render lại (không giật/không đè).
  const applyEdit = useCallback(
    (compute) => {
      const el = textareaRef.current;
      if (!el) return;
      const result = compute(el.value, el.selectionStart, el.selectionEnd);
      if (!result) return;
      const { newValue, newStart, newEnd } = result;
      el.value = newValue;
      el.setSelectionRange(newStart, newEnd);
      el.focus();
      onChange(newValue);
    },
    [onChange]
  );

  function wrap(before, after = before, placeholderText = "") {
    applyEdit((text, start, end) => {
      const selected = text.slice(start, end) || placeholderText;
      const newValue = text.slice(0, start) + before + selected + after + text.slice(end);
      const newStart = start + before.length;
      return { newValue, newStart, newEnd: newStart + selected.length };
    });
  }

  function prefixLines(prefixFn) {
    applyEdit((text, start, end) => {
      const { lineStart, lineEnd } = getLineRange(text, start, end);
      const block = text.slice(lineStart, lineEnd);
      const lines = block.split("\n");
      const newLines = lines.map((line, i) => prefixFn(line, i));
      const newBlock = newLines.join("\n");
      const newValue = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
      return { newValue, newStart: lineStart, newEnd: lineStart + newBlock.length };
    });
  }

  function insertBlock(template) {
    applyEdit((text, start, end) => {
      const needsNewlineBefore = start > 0 && text[start - 1] !== "\n";
      const needsNewlineAfter = end < text.length && text[end] !== "\n";
      const insert = `${needsNewlineBefore ? "\n" : ""}${template}${needsNewlineAfter ? "\n" : ""}`;
      const newValue = text.slice(0, start) + insert + text.slice(end);
      const cursor = start + insert.length;
      return { newValue, newStart: cursor, newEnd: cursor };
    });
  }

  function toggleHeading(level) {
    const marker = "#".repeat(level) + " ";
    prefixLines((line) => {
      const stripped = line.replace(/^#{1,6}\s+/, "");
      return line.startsWith(marker) ? stripped : marker + stripped;
    });
  }

  function insertLink() {
    const el = textareaRef.current;
    const selected = el ? el.value.slice(el.selectionStart, el.selectionEnd) : "";
    const url = window.prompt("Đường dẫn (URL):", "https://");
    if (url === null) return;
    wrap("[", `](${url})`, selected || "văn bản liên kết");
  }

  function insertImage() {
    const url = window.prompt("URL ảnh:", "https://");
    if (url === null) return;
    const alt = window.prompt("Mô tả ảnh (alt text):", "") || "";
    insertBlock(`![${alt}](${url})`);
  }

  function insertTable() {
    insertBlock("| Cột 1 | Cột 2 |\n| --- | --- |\n| Nội dung | Nội dung |");
  }

  function handleKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "b") {
      e.preventDefault();
      wrap("**", "**", "chữ đậm");
    } else if (e.key === "i") {
      e.preventDefault();
      wrap("*", "*", "chữ nghiêng");
    } else if (e.key === "k") {
      e.preventDefault();
      insertLink();
    }
  }

  const buttons = [
    { label: "B", title: "Đậm (Ctrl+B)", style: { fontWeight: 700 }, onClick: () => wrap("**", "**", "chữ đậm") },
    { label: "I", title: "Nghiêng (Ctrl+I)", style: { fontStyle: "italic" }, onClick: () => wrap("*", "*", "chữ nghiêng") },
    {
      label: "S",
      title: "Gạch ngang",
      style: { textDecoration: "line-through" },
      onClick: () => wrap("~~", "~~", "chữ gạch ngang"),
    },
    { divider: true },
    { label: "H2", title: "Tiêu đề cấp 2", onClick: () => toggleHeading(2) },
    { label: "H3", title: "Tiêu đề cấp 3", onClick: () => toggleHeading(3) },
    { divider: true },
    { label: "❝", title: "Trích dẫn", onClick: () => prefixLines((line) => `> ${line}`) },
    { label: "</>", title: "Mã (inline)", onClick: () => wrap("`", "`", "mã") },
    {
      label: "{ }",
      title: "Khối mã",
      onClick: () => insertBlock("```\nnhập mã ở đây\n```"),
    },
    { divider: true },
    { label: "•", title: "Danh sách", onClick: () => prefixLines((line) => `- ${line}`) },
    {
      label: "1.",
      title: "Danh sách đánh số",
      onClick: () => prefixLines((line, i) => `${i + 1}. ${line}`),
    },
    { divider: true },
    { label: "Liên kết", title: "Chèn liên kết (Ctrl+K)", onClick: insertLink },
    { label: "Ảnh", title: "Chèn ảnh", onClick: insertImage },
    { label: "Bảng", title: "Chèn bảng", onClick: insertTable },
    { label: "—", title: "Đường kẻ ngang", onClick: () => insertBlock("---") },
  ];

  return (
    <div className="md-editor">
      <div className="md-editor__toolbar" role="toolbar" aria-label="Định dạng Markdown">
        {buttons.map((b, i) =>
          b.divider ? (
            <span className="md-editor__divider" key={`div-${i}`} />
          ) : (
            <button
              type="button"
              key={b.label}
              className="md-editor__btn"
              title={b.title}
              style={b.style}
              onClick={b.onClick}
              disabled={mode === "preview"}
            >
              {b.label}
            </button>
          )
        )}
        <span className="md-editor__spacer" />
        <div className="md-editor__tabs">
          <button
            type="button"
            className={`md-editor__tab ${mode === "write" ? "is-active" : ""}`}
            onClick={() => setMode("write")}
          >
            Soạn thảo
          </button>
          <button
            type="button"
            className={`md-editor__tab ${mode === "preview" ? "is-active" : ""}`}
            onClick={() => setMode("preview")}
          >
            Xem trước
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          className="md-editor__textarea"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
      ) : (
        <div
          className="md-editor__preview"
          style={{ minHeight: `${rows * 1.6}em` }}
          dangerouslySetInnerHTML={{ __html: markdownToHtml(value) }}
        />
      )}
    </div>
  );
}
