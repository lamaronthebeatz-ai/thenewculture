import { useId, useState } from "react";

// TNCOS component library — Tooltip. Bọc quanh 1 phần tử con duy nhất, hiện
// khi hover HOẶC focus (bàn phím) — không chỉ hover, để đúng yêu cầu
// Accessibility.
export default function Tooltip({ label, children }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="tncos-tooltip-wrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {typeof children === "function" ? children({ "aria-describedby": id }) : children}
      {visible && (
        <span role="tooltip" id={id} className="tncos-tooltip tncos-fade-in">
          {label}
        </span>
      )}
    </span>
  );
}
