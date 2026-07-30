import { useState, useId } from "react";

// TNCOS component library — Tabs. items: [{ key, label, content }]
export default function Tabs({ items, defaultKey, onChange }) {
  const [active, setActive] = useState(defaultKey || items[0]?.key);
  const baseId = useId();

  function select(key) {
    setActive(key);
    onChange?.(key);
  }

  function handleKeyDown(e, idx) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + items.length) % items.length;
      select(items[next].key);
      document.getElementById(`${baseId}-tab-${items[next].key}`)?.focus();
    }
  }

  const activeItem = items.find((i) => i.key === active);

  return (
    <div className="tncos-tabs">
      <div className="tncos-tabs__list" role="tablist">
        {items.map((item, idx) => (
          <button
            key={item.key}
            id={`${baseId}-tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={active === item.key}
            aria-controls={`${baseId}-panel-${item.key}`}
            tabIndex={active === item.key ? 0 : -1}
            className={active === item.key ? "tncos-tabs__tab is-active" : "tncos-tabs__tab"}
            onClick={() => select(item.key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel-${active}`} role="tabpanel" className="tncos-tabs__panel">
        {activeItem?.content}
      </div>
    </div>
  );
}
