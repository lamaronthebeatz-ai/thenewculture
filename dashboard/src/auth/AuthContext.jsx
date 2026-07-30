import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

// Ghi log hoạt động (Rev 13 activity_log) — best-effort, không bao giờ chặn
// luồng chính của người dùng nếu insert thất bại (vd RLS/network tạm thời).
async function logActivity(actorId, actorEmail, action, targetType = null, targetId = null, metadata = {}) {
  try {
    await supabase.from("activity_log").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
  } catch (err) {
    console.error("Không ghi được activity_log:", err);
  }
}

// Trạng thái xác thực: "loading" (đang kiểm tra) | "signed-out" | "not-editor" | "editor"
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [editorProfile, setEditorProfile] = useState(null);
  const [dashboardUser, setDashboardUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  // Chỉ ghi log "login" đúng 1 lần cho mỗi phiên đăng nhập thật sự — tránh
  // ghi trùng khi onAuthStateChange bắn lại (refresh token, focus lại tab).
  const loggedLoginRef = useRef(false);

  const checkEditor = useCallback(async (currentSession, event) => {
    if (!currentSession) {
      setStatus("signed-out");
      setEditorProfile(null);
      setDashboardUser(null);
      setPermissions(new Set());
      loggedLoginRef.current = false;
      return;
    }
    // is_active_editor() (public.is_active_editor, Rev 5, siết chặt thêm
    // is_active=true ở Rev 13) khớp email của auth.uid() hiện tại với 1 dòng
    // authors.email đang active — không lộ dữ liệu auth.users nào ra client,
    // chỉ trả về true/false. Đây vẫn là điều kiện gốc để vào Dashboard, RBAC
    // (dashboard_users/permissions) là lớp phân quyền chi tiết bổ sung THÊM
    // trên nền tảng này, không thay thế.
    const { data: isEditor, error } = await supabase.rpc("is_active_editor");
    if (error) {
      console.error("Không kiểm tra được quyền editor:", error);
      setStatus("not-editor");
      setEditorProfile(null);
      setDashboardUser(null);
      setPermissions(new Set());
      return;
    }
    if (!isEditor) {
      setStatus("not-editor");
      setEditorProfile(null);
      setDashboardUser(null);
      setPermissions(new Set());
      return;
    }
    const email = currentSession.user.email;
    const [{ data: author }, { data: duRow }, { data: perms }] = await Promise.all([
      supabase.from("authors").select("id, slug, name, avatar_url, role").ilike("email", email).is("deleted_at", null).maybeSingle(),
      supabase.from("dashboard_users").select("*").eq("id", currentSession.user.id).maybeSingle(),
      supabase.rpc("my_permissions"),
    ]);
    setEditorProfile(author || null);
    setDashboardUser(duRow || null);
    setPermissions(new Set((perms || []).map((p) => p.permission_key)));
    setStatus("editor");

    // last_login_at: dòng dashboard_users tự cập nhật (policy "Users can
    // update own profile" cho phép, và trigger guard không chặn field này —
    // chỉ chặn role_id/status/department_id/team_id/position_id/author_id).
    if (duRow) {
      const patch = { last_login_at: new Date().toISOString() };
      // Đồng bộ lại dashboard_users.email nếu người dùng vừa xác nhận đổi
      // email qua Supabase Auth (auth.users.email đã đổi nhưng bản sao ở
      // dashboard_users.email — dùng để hiển thị/tìm kiếm — chưa cập nhật).
      if (duRow.email !== email) patch.email = email;
      supabase.from("dashboard_users").update(patch).eq("id", duRow.id);
    }
    if (event === "SIGNED_IN" && !loggedLoginRef.current) {
      loggedLoginRef.current = true;
      logActivity(currentSession.user.id, email, "login");
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      checkEditor(s);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // PASSWORD_RECOVERY: Supabase đã cấp 1 session tạm để đổi mật khẩu —
      // không reset về "loading" (tránh nháy màn hình RequireEditor trong
      // lúc người dùng đang ở trang /reset-password).
      if (event !== "SIGNED_IN" && event !== "PASSWORD_RECOVERY") setStatus("loading");
      checkEditor(s, event);
    });
    return () => listener.subscription.unsubscribe();
  }, [checkEditor]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }, []);

  const signOut = useCallback(async () => {
    if (session?.user) {
      await logActivity(session.user.id, session.user.email, "logout");
    }
    await supabase.auth.signOut();
  }, [session]);

  const resetPasswordForEmail = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return error;
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return error;
  }, []);

  const hasPermission = useCallback((key) => permissions.has(key), [permissions]);

  const recordActivity = useCallback(
    (action, targetType, targetId, metadata) => {
      if (!session?.user) return;
      return logActivity(session.user.id, session.user.email, action, targetType, targetId, metadata);
    },
    [session],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        status,
        editorProfile,
        dashboardUser,
        permissions,
        hasPermission,
        signIn,
        signOut,
        resetPasswordForEmail,
        updatePassword,
        recordActivity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() phải dùng trong <AuthProvider>");
  return ctx;
}
