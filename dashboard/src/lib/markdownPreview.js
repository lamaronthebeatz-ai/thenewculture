// Trình dịch Markdown -> HTML TỐI GIẢN, tự viết, không phụ thuộc thư viện
// ngoài — CHỈ phục vụ khung "Xem trước" trong MarkdownEditor (công cụ hỗ
// trợ biên tập). KHÔNG phải nguồn xử lý khi xuất bản thật: build.py dùng
// thư viện Python "markdown" khi render bài viết lên site — 2 nơi có thể
// khác biệt ở các cú pháp Markdown hiếm gặp, chấp nhận được vì đây chỉ là
// bản xem trước tức thời, không phải kết quả cuối cùng.
//
// Luôn escape HTML trước khi áp cú pháp Markdown (chèn thẻ <strong>/<a>/...
// sau bước escape) — bắt buộc để tránh XSS: nội dung bài viết là do người
// dùng gõ tự do, render thẳng qua dangerouslySetInnerHTML.

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function applyInline(text) {
  let html = escapeHtml(text);
  // Ảnh trước link (cú pháp ảnh lồng "!" + link) để không bị link nuốt mất "!".
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => `<img alt="${escapeAttr(alt)}" src="${escapeAttr(url)}" />`);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}

export function markdownToHtml(source) {
  const lines = (source || "").split("\n");
  const out = [];
  let i = 0;
  let listType = null; // "ul" | "ol" | null
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length) {
      out.push(`<p>${applyInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }
  function closeList() {
    if (listType) {
      out.push(listType === "ul" ? "</ul>" : "</ol>");
      listType = null;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushParagraph();
      closeList();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${applyInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      out.push("<hr />");
      i++;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      const quoteLines = [quote[1]];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${applyInline(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${applyInline(bullet[1])}</li>`);
      i++;
      continue;
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${applyInline(numbered[1])}</li>`);
      i++;
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      closeList();
      i++;
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }

  flushParagraph();
  closeList();
  return out.join("\n");
}
