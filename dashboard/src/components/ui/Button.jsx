import { forwardRef } from "react";

// TNCOS component library — Button. variant: solid | ghost | subtle | danger.
// size: sm | md | lg (tham chiếu --control-height-*).
const Button = forwardRef(function Button(
  { variant = "solid", size = "md", icon = false, className = "", children, ...props },
  ref,
) {
  const classes = ["tncos-btn", `tncos-btn--${variant}`, `tncos-btn--${size}`, icon ? "tncos-btn--icon" : "", "tncos-pressable", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
