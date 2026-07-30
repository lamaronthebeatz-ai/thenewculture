// TNCOS component library — Badge. tone: neutral | success | warning | danger | brand.
export default function Badge({ tone = "neutral", children, className = "" }) {
  return <span className={`tncos-badge tncos-badge--${tone} ${className}`}>{children}</span>;
}
