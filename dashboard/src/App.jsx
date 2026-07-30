import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireEditor from "./auth/RequireEditor";
import ForgotPassword from "./auth/ForgotPassword";
import ResetPassword from "./auth/ResetPassword";
import DashboardLayout from "./layout/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import ArticlesList from "./pages/ArticlesList";
import ArticleForm from "./pages/ArticleForm";
import AuthorsList from "./pages/AuthorsList";
import AuthorForm from "./pages/AuthorForm";
import CategoriesList from "./pages/CategoriesList";
import CategoryForm from "./pages/CategoryForm";
import SeriesList from "./pages/SeriesList";
import SeriesForm from "./pages/SeriesForm";
import TagsList from "./pages/TagsList";
import MediaList from "./pages/MediaList";
import MediaForm from "./pages/MediaForm";
import SiteSettings from "./pages/SiteSettings";
import MenuBuilder from "./pages/MenuBuilder";
import FooterBuilder from "./pages/FooterBuilder";
import HeroManager from "./pages/HeroManager";
import AdManager from "./pages/AdManager";
import PromotionManager from "./pages/PromotionManager";
import AnnouncementManager from "./pages/AnnouncementManager";
import TncSelectsManager from "./pages/TncSelectsManager";
import MagazineManager from "./pages/MagazineManager";
import UsersList from "./pages/UsersList";
import UserForm from "./pages/UserForm";
import RolesManager from "./pages/RolesManager";
import OrganizationManager from "./pages/OrganizationManager";
import Profile from "./pages/Profile";
import ActivityLog from "./pages/ActivityLog";

function DashboardRoutes() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
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
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}
