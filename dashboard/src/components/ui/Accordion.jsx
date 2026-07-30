import { useState } from "react";

// TNCOS component library — Accordion. items: [{ key, title, content }]
export default function Accordion({ items, allowMultiple = false, defaultOpenKeys = [] }) {
  const [openKeys, setOpenKeys] = useState(new Set(defaultOpenKeys));

  function toggle(key) {
    setOpenKeys((prev) => {
      const next = allowMultiple ? new Set(prev) : new Set();
      if (prev.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="tncos-accordion">
      {items.map((item) => {
        const isOpen = openKeys.has(item.key);
        return (
          <div key={item.key} className="tncos-accordion__item">
            <button
              type="button"
              className="tncos-accordion__trigger"
              aria-expanded={isOpen}
              onClick={() => toggle(item.key)}
            >
              <span>{item.title}</span>
              <span className={isOpen ? "tncos-accordion__chevron is-open" : "tncos-accordion__chevron"} aria-hidden="true">
                ▾
              </span>
            </button>
            {isOpen && <div className="tncos-accordion__panel tncos-fade-in">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}
