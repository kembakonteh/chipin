import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import AuthVerify from './pages/AuthVerify'
import Dashboard from './pages/Dashboard'
import CampaignDetail from './pages/CampaignDetail'
import PublicCampaign from './pages/PublicCampaign'
import OrgsPage from './pages/OrgsPage'
import OrgDetail from './pages/OrgDetail'
import PublicOrgPage from './pages/PublicOrg'

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1f2937',
            color: '#f3f4f6',
            border: '1px solid #374151',
          },
          success: { iconTheme: { primary: '#40916C', secondary: '#D8F3DC' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/verify" element={<AuthVerify />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/dashboard/:slug" element={<Protected><CampaignDetail /></Protected>} />
        <Route path="/campaigns/:slug" element={<Protected><CampaignDetail /></Protected>} />
        <Route path="/orgs" element={<Protected><OrgsPage /></Protected>} />
        <Route path="/orgs/:slug" element={<Protected><OrgDetail /></Protected>} />
        <Route path="/p/:slug" element={<PublicCampaign />} />
        <Route path="/o/:slug" element={<PublicOrgPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
