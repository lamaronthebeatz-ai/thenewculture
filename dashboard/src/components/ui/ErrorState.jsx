// TNCOS component library — ErrorState (khác .field-error inline — dùng khi
// cả 1 khu vực/trang không tải được, không phải lỗi validate 1 trường).
export default function ErrorState({ title = "Có lỗi xảy ra", message, onRetry }) {
  return (
    <div className="tncos-error-state" role="alert">
      <div className="tncos-error-state__icon" aria-hidden="true">
        ⚠
      </div>
      <p className="tncos-error-state__title">{title}</p>
      {message && <p className="muted small">{message}</p>}
      {onRetry && (
        <button type="button" className="tncos-btn tncos-btn--ghost tncos-btn--sm" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
