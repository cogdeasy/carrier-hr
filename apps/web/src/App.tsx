import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { AppLayout } from './components/layout/AppLayout';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BenefitsPage } from './pages/BenefitsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LearningPage } from './pages/LearningPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { OrgChartPage } from './pages/OrgChartPage';
import { PayrollPage } from './pages/PayrollPage';
import { PerformancePage } from './pages/PerformancePage';
import { ProfilePage } from './pages/ProfilePage';
import { RecruitingPage } from './pages/RecruitingPage';
import { TimesheetsPage } from './pages/TimesheetsPage';
import { EmployeeDetailPage } from './pages/directory/EmployeeDetailPage';
import { DirectoryPage } from './pages/directory/DirectoryPage';
import { TimeOffPage } from './pages/timeoff/TimeOffPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/directory" element={<DirectoryPage />} />
        <Route path="/directory/:id" element={<EmployeeDetailPage />} />
        <Route path="/org-chart" element={<OrgChartPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/time-off" element={<TimeOffPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/payroll" element={<PayrollPage />} />
        <Route path="/benefits" element={<BenefitsPage />} />
        <Route path="/performance" element={<PerformancePage />} />
        <Route path="/learning" element={<LearningPage />} />
        <Route path="/recruiting" element={<RecruitingPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
