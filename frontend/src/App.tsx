import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useWorkspaceStore } from './store/workspaceStore';
import type { AppModule } from './types';
// Core shell loads eagerly; everything else is code-split so the initial bundle
// stays small and each page (esp. the large InstagramPage) downloads on demand.
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Home from './pages/Home';

const BoardPage = lazy(() => import('./pages/BoardPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotificationsPanel = lazy(() => import('./components/notifications/NotificationsPanel'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const BibixBotPage = lazy(() => import('./pages/BibixBotPage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));
const SchedulingPage = lazy(() => import('./pages/SchedulingPage'));
const CRMPage = lazy(() => import('./pages/CRMPage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const PublicFormPage = lazy(() => import('./pages/PublicFormPage'));
const InstagramPage = lazy(() => import('./pages/InstagramPage'));
const LinkedInPage = lazy(() => import('./pages/LinkedInPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-monday-blue border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-4 border-monday-blue border-t-transparent rounded-full" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ModuleRoute({ module, children }: { module: AppModule; children: React.ReactNode }) {
  const { hasPermission } = useAuthStore();
  if (!hasPermission(module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loadUser } = useAuthStore();
  const { loadWorkspaces } = useWorkspaceStore();
  const { user } = useAuthStore();

  useEffect(() => { loadUser(); }, []);
  useEffect(() => { if (user) loadWorkspaces(); }, [user?.id]);

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/schedule/:userId" element={<BookingPage />} />
      <Route path="/form/:formId" element={<PublicFormPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Home />} />
        <Route path="board/:boardId" element={<BoardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="notifications" element={<NotificationsPanel />} />
        <Route path="calendar" element={<ModuleRoute module="calendar"><CalendarPage /></ModuleRoute>} />
        <Route path="bibixbot" element={<ModuleRoute module="bibixbot"><BibixBotPage /></ModuleRoute>} />
        <Route path="scheduling" element={<ModuleRoute module="scheduling"><SchedulingPage /></ModuleRoute>} />
        <Route path="crm" element={<ModuleRoute module="crm"><CRMPage /></ModuleRoute>} />
        <Route path="invoices" element={<InvoicePage />} />
        <Route path="bi" element={<ModuleRoute module="reports"><ReportsPage /></ModuleRoute>} />
        <Route path="instagram" element={<Navigate to="/marketing/instagram" replace />} />
        <Route path="marketing/instagram" element={<ModuleRoute module="instagram"><InstagramPage /></ModuleRoute>} />
        <Route path="marketing/linkedin"  element={<ModuleRoute module="linkedin"><LinkedInPage /></ModuleRoute>} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
