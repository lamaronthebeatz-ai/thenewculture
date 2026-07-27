import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireEditor from "./auth/RequireEditor";
import DashboardLayout from "./layout/DashboardLayout";
import ArticlesList from "./pages/ArticlesList";
import ArticleForm from "./pages/ArticleForm";
import AuthorsPage from "./pages/AuthorsPage";
import CategoriesPage from "./pages/CategoriesPage";
import SeriesPage from "./pages/SeriesPage";
import TagsPage from "./pages/TagsPage";
import MediaPage from "./pages/MediaPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RequireEditor>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route index element={<Navigate to="/articles" replace />} />
              <Route path="articles" element={<ArticlesList />} />
              <Route path="articles/new" element={<ArticleForm />} />
              <Route path="articles/:id" element={<ArticleForm />} />
              <Route path="authors" element={<AuthorsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="series" element={<SeriesPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="media" element={<MediaPage />} />
              <Route path="*" element={<Navigate to="/articles" replace />} />
            </Route>
          </Routes>
        </RequireEditor>
      </AuthProvider>
    </BrowserRouter>
  );
}
