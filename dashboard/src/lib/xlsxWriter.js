// Trình ghi .xlsx (OOXML) TỰ VIẾT, KHÔNG phụ thuộc thư viện ngoài.
//
// Lý do không dùng gói "xlsx" (SheetJS) trên npm: bản đăng trên npm registry
// mắc 2 lỗ hổng SEVERITY HIGH chưa có bản vá (Prototype Pollution + ReDoS —
// GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9), vì SheetJS đã ngừng cập nhật
// bản npm từ lâu (bản vá thật chỉ có trên CDN riêng của họ). Nhu cầu ở đây
// CHỈ LÀ GHI (tạo file .xlsx từ dữ liệu do chính Dashboard kiểm soát, không
// bao giờ ĐỌC file .xlsx từ bên ngoài) — cả 2 lỗ hổng trên đều nằm ở đường
// PARSE (đọc file .xlsx độc hại), không áp dụng cho luồng ghi thuần này.
// Thay vì chấp nhận rủi ro chuỗi cung ứng của 1 gói không còn được vá, tự
// viết đúng phần XML/ZIP tối thiểu cần thiết (1 sheet, inline string, ZIP
// STORED không nén — dữ liệu báo cáo nhỏ, không cần nén) — an toàn tuyệt
// đối vì không có bước "đọc" nào, chỉ tuần tự hoá dữ liệu đã biết trước
// thành XML tĩnh.

function textEncode(str) {
  return new TextEncoder().encode(str);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colLetter(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  pushBytes(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }
  pushU16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.pushBytes(b);
  }
  pushU32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.pushBytes(b);
  }
  toUint8Array() {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

// Tạo 1 file .zip tối thiểu (phương thức STORED — không nén) chứa đúng các
// entry truyền vào. Đủ chuẩn để Excel/Google Sheets/LibreOffice mở đúng.
function buildZip(entries) {
  const w = new ByteWriter();
  const centralRecords = [];

  for (const { name, data } of entries) {
    const nameBytes = textEncode(name);
    const crc = crc32(data);
    const offset = w.length;

    w.pushU32(0x04034b50); // local file header signature
    w.pushU16(20); // version needed
    w.pushU16(0); // flags
    w.pushU16(0); // compression = stored
    w.pushU16(0); // mod time
    w.pushU16(0); // mod date
    w.pushU32(crc);
    w.pushU32(data.length); // compressed size
    w.pushU32(data.length); // uncompressed size
    w.pushU16(nameBytes.length);
    w.pushU16(0); // extra length
    w.pushBytes(nameBytes);
    w.pushBytes(data);

    centralRecords.push({ nameBytes, crc, size: data.length, offset });
  }

  const centralStart = w.length;
  for (const rec of centralRecords) {
    w.pushU32(0x02014b50); // central directory signature
    w.pushU16(20); // version made by
    w.pushU16(20); // version needed
    w.pushU16(0); // flags
    w.pushU16(0); // compression
    w.pushU16(0); // mod time
    w.pushU16(0); // mod date
    w.pushU32(rec.crc);
    w.pushU32(rec.size);
    w.pushU32(rec.size);
    w.pushU16(rec.nameBytes.length);
    w.pushU16(0); // extra length
    w.pushU16(0); // comment length
    w.pushU16(0); // disk number start
    w.pushU16(0); // internal attrs
    w.pushU32(0); // external attrs
    w.pushU32(rec.offset);
    w.pushBytes(rec.nameBytes);
  }
  const centralSize = w.length - centralStart;

  w.pushU32(0x06054b50); // end of central directory signature
  w.pushU16(0); // disk number
  w.pushU16(0); // disk with central dir
  w.pushU16(centralRecords.length);
  w.pushU16(centralRecords.length);
  w.pushU32(centralSize);
  w.pushU32(centralStart);
  w.pushU16(0); // comment length

  return w.toUint8Array();
}

function buildSheetXml(headers, rows) {
  const colCount = headers.length;
  const lines = [];
  lines.push(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      "<sheetData>"
  );

  function rowXml(rowIndex, values) {
    const cells = values
      .map((v, colIdx) => {
        const ref = `${colLetter(colIdx)}${rowIndex}`;
        if (typeof v === "number" && Number.isFinite(v)) {
          return `<c r="${ref}" t="n"><v>${v}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
      })
      .join("");
    return `<row r="${rowIndex}">${cells}</row>`;
  }

  lines.push(rowXml(1, headers.map((h) => h.label ?? h)));
  rows.forEach((row, i) => {
    const values = headers.map((h) => row[h.key ?? h]);
    lines.push(rowXml(i + 2, values));
  });

  lines.push("</sheetData></worksheet>");
  void colCount;
  return lines.join("");
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  "</Relationships>";

function buildWorkbookXml(sheetName) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets>` +
    "</workbook>"
  );
}

// headers: [{key,label}] hoặc chuỗi. rows: mảng object. Trả về Uint8Array
// nội dung file .xlsx hoàn chỉnh.
export function buildXlsx(sheetName, headers, rows) {
  const entries = [
    { name: "[Content_Types].xml", data: textEncode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: textEncode(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: textEncode(buildWorkbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: textEncode(WORKBOOK_RELS_XML) },
    { name: "xl/worksheets/sheet1.xml", data: textEncode(buildSheetXml(headers, rows)) },
  ];
  return buildZip(entries);
}
