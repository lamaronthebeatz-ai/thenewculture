import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import RequireEditor from "./auth/RequireEditor";
import DashboardLayout from "./layout/DashboardLayout";
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

              <Route path="media" element={<MediaList />} />
              <Route path="media/new" element={<MediaForm />} />
              <Route path="media/:id" element={<MediaForm />} />

              <Route path="*" element={<Navigate to="/articles" replace />} />
            </Route>
          </Routes>
        </RequireEditor>
      </AuthProvider>
    </BrowserRouter>
  );
}
