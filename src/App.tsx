import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import UploadResumePage from './pages/UploadResumePage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/resume/upload" element={<UploadResumePage />} />
          <Route path="/applications/:id" element={<ErrorBoundary><ApplicationDetailPage /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
