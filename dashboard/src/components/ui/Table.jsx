// TNCOS component library — Table. columns: [{ key, label, render? }],
// rows: array of objects. Dùng cho code mới; trang hiện có tự render
// <table className="data-table"> trực tiếp vẫn hợp lệ (cùng CSS nền tảng).
export default function Table({ columns, rows, rowKey = "id", emptyMessage = "Không có dữ liệu." }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[rowKey]}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="muted">
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
