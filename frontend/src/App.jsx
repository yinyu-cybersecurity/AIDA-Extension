import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { PendingCommandsProvider } from './contexts/PendingCommandsContext';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Assessments from './pages/Assessments';
import AssessmentDetail from './pages/AssessmentDetail';
import Commands from './pages/Commands';
import Settings from './pages/Settings';
import useCommandNotifications from './hooks/useCommandNotifications';
import CommandApprovalToast from './components/common/CommandApprovalBanner';

// Notifications wrapper component
function NotificationHandler() {
  useCommandNotifications();
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <WebSocketProvider>
          <PendingCommandsProvider>
            <NotificationHandler />
            <CommandApprovalToast />
            <Routes>
              <Route path="/" element={<MainLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="assessments" element={<Assessments />} />
                <Route path="assessments/:id" element={<AssessmentDetail />} />
                <Route path="commands" element={<Commands />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </PendingCommandsProvider>
        </WebSocketProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
