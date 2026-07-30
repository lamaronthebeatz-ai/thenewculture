import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../auth/AuthContext";
import { Dialog } from "./ui";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

// TNCOS Universal Search (Phase 1) — tìm nhanh qua Article/Media/Author/
// Series/Category/User, điều hướng khi bấm kết quả. Chuẩn bị nền tảng cho
// Command Palette ở Phase 2 (chưa triển khai lệnh/action ở đây, chỉ tìm +
// điều hướng, đúng phạm vi Phase 1 đã nêu).
export default function UniversalSearch({ open, onClose }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setGroups([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setGroups([]);
      return;
    }
    const myRequest = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const like = `%${q}%`;
      const queries = [
        supabase.from("articles").select("id, title, slug, status").ilike("title", like).is("deleted_at", null).limit(6),
        supabase.from("media").select("id, caption, url").ilike("caption", like).is("deleted_at", null).limit(6),
        supabase.from("authors").select("id, name, slug").ilike("name", like).is("deleted_at", null).limit(6),
        supabase.from("series").select("id, name").ilike("name", like).is("deleted_at", null).limit(6),
        supabase.from("categories").select("id, name").ilike("name", like).is("deleted_at", null).limit(6),
        supabase.from("magazine_issues").select("id, slug, year, month").ilike("slug", like).is("deleted_at", null).limit(6),
      ];
      if (hasPermission("users.view")) {
        queries.push(
          supabase.from("dashboard_users").select("id, display_name, email").ilike("display_name", like).is("deleted_at", null).limit(6),
        );
      }
      const [articles, media, authors, series, categories, magazine, users] = await Promise.all(queries);
      if (myRequest !== requestId.current) return; // kết quả cũ, đã có query mới hơn

      const next = [
        { label: "Articles", items: (articles.data || []).map((a) => ({ id: a.id, title: a.title, to: `/articles/${a.id}`, meta: a.status })) },
        { label: "Media", items: (media.data || []).map((m) => ({ id: m.id, title: m.caption || m.url, to: `/media/${m.id}` })) },
        { label: "Authors", items: (authors.data || []).map((a) => ({ id: a.id, title: a.name, to: `/authors/${a.id}`, meta: a.slug })) },
        { label: "Series", items: (series.data || []).map((s) => ({ id: s.id, title: s.name, to: `/series/${s.id}` })) },
        { label: "Categories", items: (categories.data || []).map((c) => ({ id: c.id, title: c.name, to: `/categories/${c.id}` })) },
        {
          label: "TNC Magazine",
          items: (magazine.data || []).map((m) => ({ id: m.id, title: `${m.slug} (${m.month}/${m.year})`, to: "/magazine" })),
        },
        ...(users
          ? [{ label: "Users", items: (users.data || []).map((u) => ({ id: u.id, title: u.display_name || u.email, to: `/users/${u.id}` })) }]
          : []),
      ].filter((g) => g.items.length > 0);

      setGroups(next);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, hasPermission]);

  function goTo(to) {
    navigate(to);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Tìm kiếm">
      <input
        ref={inputRef}
        type="search"
        className="tncos-input"
        style={{ width: "100%", marginBottom: 12 }}
        placeholder="Tìm Article, Issue, Media, Artist, Series, Category, User…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Tìm kiếm toàn hệ thống"
      />
      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="muted small">Nhập ít nhất {MIN_QUERY_LENGTH} ký tự.</p>
      )}
      {loading && <p className="muted small">Đang tìm…</p>}
      {!loading && query.trim().length >= MIN_QUERY_LENGTH && groups.length === 0 && (
        <p className="muted small">Không tìm thấy kết quả nào khớp "{query.trim()}".</p>
      )}
      <div className="universal-search__results">
        {groups.map((group) => (
          <div key={group.label} className="universal-search__group">
            <div className="sidebar__group-label" style={{ padding: "4px 0" }}>
              {group.label}
            </div>
            <ul className="universal-search__list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <button type="button" className="universal-search__item" onClick={() => goTo(item.to)}>
                    <span>{item.title}</span>
                    {item.meta && <span className="muted small">{item.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
