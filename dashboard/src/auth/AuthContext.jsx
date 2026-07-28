import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

// Trạng thái xác thực: "loading" (đang kiểm tra) | "signed-out" | "not-editor" | "editor"
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [editorProfile, setEditorProfile] = useState(null);

  const checkEditor = useCallback(async (currentSession) => {
    if (!currentSession) {
      setStatus("signed-out");
      setEditorProfile(null);
      return;
    }
    // is_active_editor() (public.is_active_editor, Rev 5) khớp email của
    // auth.uid() hiện tại với 1 dòng authors.email đang active — không lộ
    // dữ liệu auth.users nào ra client, chỉ trả về true/false.
    const { data: isEditor, error } = await supabase.rpc("is_active_editor");
    if (error) {
      console.error("Không kiểm tra được quyền editor:", error);
      setStatus("not-editor");
      setEditorProfile(null);
      return;
    }
    if (!isEditor) {
      setStatus("not-editor");
      setEditorProfile(null);
      return;
    }
    const email = currentSession.user.email;
    const { data: author } = await supabase
      .from("authors")
      .select("id, slug, name, avatar_url, role")
      .ilike("email", email)
      .is("deleted_at", null)
      .maybeSingle();
    setEditorProfile(author || null);
    setStatus("editor");
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      checkEditor(s);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus("loading");
      checkEditor(s);
    });
    return () => listener.subscription.unsubscribe();
  }, [checkEditor]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, status, editorProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() phải dùng trong <AuthProvider>");
  return ctx;
}
