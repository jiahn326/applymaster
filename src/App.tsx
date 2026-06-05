import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import UploadResumePage from './pages/UploadResumePage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
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

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/resume/upload" element={<UploadResumePage />} />
            <Route path="/applications/:id" element={<ErrorBoundary><ApplicationDetailPage /></ErrorBoundary>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthGuard>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
