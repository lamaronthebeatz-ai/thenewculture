import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireEditor from "./auth/RequireEditor";
import ForgotPassword from "./auth/ForgotPassword";
import ResetPassword from "./auth/ResetPassword";
import AppShell from "./layout/AppShell";
import { ToastProvider } from "./components/ui";

// Code-split theo route — mỗi page là 1 chunk riêng, tải khi điều hướng tới
// thay vì gộp chung 1 bundle >500KB (cảnh báo từ Vite ở Dashboard V2.1).
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const ArticlesList = lazy(() => import("./pages/ArticlesList"));
const ArticleForm = lazy(() => import("./pages/ArticleForm"));
const AuthorsList = lazy(() => import("./pages/AuthorsList"));
const AuthorForm = lazy(() => import("./pages/AuthorForm"));
const CategoriesList = lazy(() => import("./pages/CategoriesList"));
const CategoryForm = lazy(() => import("./pages/CategoryForm"));
const SeriesList = lazy(() => import("./pages/SeriesList"));
const SeriesForm = lazy(() => import("./pages/SeriesForm"));
const TagsList = lazy(() => import("./pages/TagsList"));
const MediaList = lazy(() => import("./pages/MediaList"));
const MediaForm = lazy(() => import("./pages/MediaForm"));
const SiteSettings = lazy(() => import("./pages/SiteSettings"));
const MenuBuilder = lazy(() => import("./pages/MenuBuilder"));
const FooterBuilder = lazy(() => import("./pages/FooterBuilder"));
const HeroManager = lazy(() => import("./pages/HeroManager"));
const AdManager = lazy(() => import("./pages/AdManager"));
const PromotionManager = lazy(() => import("./pages/PromotionManager"));
const AnnouncementManager = lazy(() => import("./pages/AnnouncementManager"));
const LayoutBuilder = lazy(() => import("./pages/LayoutBuilder"));
const PageLayoutsList = lazy(() => import("./pages/PageLayoutsList"));
const BlockRegistry = lazy(() => import("./pages/BlockRegistry"));
const TncSelectsManager = lazy(() => import("./pages/TncSelectsManager"));
const MagazineManager = lazy(() => import("./pages/MagazineManager"));
const UsersList = lazy(() => import("./pages/UsersList"));
const UserForm = lazy(() => import("./pages/UserForm"));
const RolesManager = lazy(() => import("./pages/RolesManager"));
const OrganizationManager = lazy(() => import("./pages/OrganizationManager"));
const Profile = lazy(() => import("./pages/Profile"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));

function RouteFallback() {
  return <div className="page">Đang tải…</div>;
}

function DashboardRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardHome />} />

          <Route path="articles" element={<ArticlesList />} />
          <Route path="articles/new" element={<ArticleForm />} />
          <Route path="articles/:id" element={<ArticleForm />} />

          <Route path="authors" element={<AuthorsList />} />
          <Route path="authors/new" element={<AuthorForm />} />
          <Route path="authors/:id" element={<AuthorForm />} />

          <Route path="categories" element={<CategoriesList />} />
          <Route path="categories/new" element={<CategoryForm />} />
          <Route path="categories/:id" element={<CategoryForm />} />

          <Route path="series" element={<SeriesList />} />
          <Route path="series/new" element={<SeriesForm />} />
          <Route path="series/:id" element={<SeriesForm />} />

          <Route path="tags" element={<TagsList />} />

          <Route path="tnc-selects" element={<TncSelectsManager />} />
          <Route path="magazine" element={<MagazineManager />} />

          <Route path="media" element={<MediaList />} />
          <Route path="media/new" element={<MediaForm />} />
          <Route path="media/:id" element={<MediaForm />} />

          <Route path="settings" element={<SiteSettings />} />
          <Route path="menus" element={<MenuBuilder />} />
          <Route path="footer" element={<FooterBuilder />} />
          <Route path="hero" element={<HeroManager />} />
          <Route path="ads" element={<AdManager />} />
          <Route path="promotions" element={<PromotionManager />} />
          <Route path="announcements" element={<AnnouncementManager />} />

          <Route path="layout/homepage" element={<LayoutBuilder fixedPageKey="homepage" />} />
          <Route path="layout/pages" element={<PageLayoutsList />} />
          <Route path="layout/pages/:pageKey" element={<LayoutBuilder />} />
          <Route path="layout/registry" element={<BlockRegistry />} />

          <Route path="users" element={<UsersList />} />
          <Route path="users/new" element={<UserForm />} />
          <Route path="users/:id" element={<UserForm />} />
          <Route path="roles" element={<RolesManager />} />
          <Route path="organization" element={<OrganizationManager />} />
          <Route path="activity-log" element={<ActivityLog />} />
          <Route path="profile" element={<Profile />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/*"
              element={
                <RequireEditor>
                  <DashboardRoutes />
                </RequireEditor>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
