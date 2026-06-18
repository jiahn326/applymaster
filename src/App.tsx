import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import UploadResumePage from './pages/UploadResumePage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAuth } from './hooks/useAuth'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )

  if (!user) return <LoginPage />

  return <>{children}</>
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
    </div>
  )
  if (user) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/dashboard" element={<AuthGuard><DashboardPage /></AuthGuard>} />
          <Route path="/resume/upload" element={<AuthGuard><UploadResumePage /></AuthGuard>} />
          <Route path="/applications/:id" element={<AuthGuard><ErrorBoundary><ApplicationDetailPage /></ErrorBoundary></AuthGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
