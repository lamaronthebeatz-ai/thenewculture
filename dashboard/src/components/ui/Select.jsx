import { forwardRef } from "react";

const Select = forwardRef(function Select({ label, hint, error, id, options = [], placeholder, className = "", ...props }, ref) {
  return (
    <label className={`tncos-field ${className}`} htmlFor={id}>
      {label && <span className="tncos-field__label">{label}</span>}
      <select ref={ref} id={id} className="tncos-input tncos-select" aria-invalid={!!error} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <span className="tncos-field__error">{error}</span> : hint ? <span className="tncos-field__hint">{hint}</span> : null}
    </label>
  );
});

export default Select;
