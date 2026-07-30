import { forwardRef } from "react";

// TNCOS component library — Input. Field wrapper chuẩn: label + input + hint/
// error, dùng cho form mới; form hiện có dùng .form label > input vẫn hoạt
// động nguyên vẹn (cùng token, không xung đột style).
const Input = forwardRef(function Input({ label, hint, error, id, className = "", ...props }, ref) {
  return (
    <label className={`tncos-field ${className}`} htmlFor={id}>
      {label && <span className="tncos-field__label">{label}</span>}
      <input ref={ref} id={id} className="tncos-input" aria-invalid={!!error} {...props} />
      {error ? <span className="tncos-field__error">{error}</span> : hint ? <span className="tncos-field__hint">{hint}</span> : null}
    </label>
  );
});

export default Input;
