// TNCOS component library — Avatar. Ảnh nếu có src, ngược lại initials từ name.
export default function Avatar({ src, name = "", size = "md" }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={`tncos-avatar tncos-avatar--${size}`} aria-hidden={!name} role={name ? "img" : undefined} aria-label={name || undefined}>
      {src ? <img src={src} alt="" /> : <span className="tncos-avatar__initials">{initials || "?"}</span>}
    </span>
  );
}
