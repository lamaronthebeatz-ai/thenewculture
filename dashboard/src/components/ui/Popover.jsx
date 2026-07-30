import { useRef, useState } from "react";
import { useDismiss } from "./useDismiss";

// TNCOS component library — Popover. trigger render-prop nhận { onClick,
// "aria-expanded" } để gắn vào phần tử kích hoạt.
export default function Popover({ trigger, children, align = "start" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div className="tncos-popover-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {open && (
        <div className={`tncos-popover tncos-popover--${align} tncos-scale-in`} role="dialog">
          {children}
        </div>
      )}
    </div>
  );
}
