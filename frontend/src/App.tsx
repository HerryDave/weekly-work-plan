import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GroupsPage from './pages/GroupsPage';
import UsersPage from './pages/UsersPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PlansPage from './pages/PlansPage';
import EffortsPage from './pages/EffortsPage';
import AlertsPage from './pages/AlertsPage';
import NotificationsPage from './pages/NotificationsPage';
import ManpowerPage from './pages/ManpowerPage';
import OperationsLogPage from './pages/OperationsLogPage';
import ProjectWeeklyPlanPage from './pages/ProjectWeeklyPlanPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles,
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div style={{ textAlign: 'center', padding: 50 }}>加载中...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="groups"
          element={
            <ProtectedRoute allowedRoles={['manager']}>
              <GroupsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="users"
          element={
            <ProtectedRoute allowedRoles={['manager']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route
          path="manpower"
          element={
            <ProtectedRoute allowedRoles={['manager']}>
              <ManpowerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="plans"
          element={
            <ProtectedRoute allowedRoles={['manager', 'leader']}>
              <PlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="efforts"
          element={
            <ProtectedRoute allowedRoles={['manager', 'leader']}>
              <EffortsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="project-weekly-plan"
          element={
            <ProtectedRoute allowedRoles={['manager', 'leader']}>
              <ProjectWeeklyPlanPage />
            </ProtectedRoute>
          }
        />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="operations"
          element={
            <ProtectedRoute allowedRoles={['manager']}>
              <OperationsLogPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
