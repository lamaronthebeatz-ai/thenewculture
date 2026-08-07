import { buildXlsx } from "./xlsxWriter";

// "Báo cáo" (PHẦN XVI spec) — Xuất PDF/Excel/CSV. PDF dùng window.print()
// (đúng chuẩn browser-native, không thêm thư viện — xem .printable-report
// trong assets.css). CSV + Excel đều thuần JS, KHÔNG phụ thuộc thư viện
// ngoài (xem lib/xlsxWriter.js — lý do không dùng gói "xlsx" trên npm: 2 lỗ
// hổng severity HIGH chưa có bản vá).

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(filename, headers, rows) {
  const lines = [headers.map((h) => csvEscape(h.label ?? h)).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h.key ?? h])).join(","));
  }
  // BOM để Excel/Sheets nhận đúng UTF-8 (không lỗi dấu tiếng Việt).
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename, blob);
}

export function exportXlsx(filename, sheetName, headers, rows) {
  const bytes = buildXlsx(sheetName, headers, rows);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(filename, blob);
}
