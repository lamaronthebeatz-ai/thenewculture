import { forwardRef } from "react";

const Textarea = forwardRef(function Textarea({ label, hint, error, id, className = "", ...props }, ref) {
  return (
    <label className={`tncos-field ${className}`} htmlFor={id}>
      {label && <span className="tncos-field__label">{label}</span>}
      <textarea ref={ref} id={id} className="tncos-input tncos-textarea" aria-invalid={!!error} {...props} />
      {error ? <span className="tncos-field__error">{error}</span> : hint ? <span className="tncos-field__hint">{hint}</span> : null}
    </label>
  );
});

export default Textarea;
