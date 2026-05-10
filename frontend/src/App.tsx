import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import AuthVerify from './pages/AuthVerify'
import AuthLanding from './pages/AuthLanding'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import CampaignDetail from './pages/CampaignDetail'
import PublicCampaign from './pages/PublicCampaign'
import OrgsPage from './pages/OrgsPage'
import OrgDetail from './pages/OrgDetail'
import PublicOrgPage from './pages/PublicOrg'
import RecurringPage from './pages/RecurringPage'
import SusuListPage from './pages/SusuListPage'
import SusuCreatePage from './pages/SusuCreatePage'
import SusuDetail from './pages/SusuDetail'
import PublicSusu from './pages/PublicSusu'
import PayoutSettings from './pages/Settings/PayoutSettings'
import ProfilePage from './pages/ProfilePage'
import JoinOrg from './pages/JoinOrg'
import CampaignsPage from './pages/CampaignsPage'
import DeclinePage from './pages/DeclinePage'
import InstallPrompt from './components/InstallPrompt'

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
        <Route path="/auth/landing" element={<AuthLanding />} />
        <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/campaigns" element={<Protected><CampaignsPage /></Protected>} />
        <Route path="/dashboard/:slug" element={<Protected><CampaignDetail /></Protected>} />
        <Route path="/campaigns/:slug" element={<Protected><CampaignDetail /></Protected>} />
        <Route path="/orgs" element={<Protected><OrgsPage /></Protected>} />
        <Route path="/orgs/:slug" element={<Protected><OrgDetail /></Protected>} />
        <Route path="/recurring" element={<Protected><RecurringPage /></Protected>} />
        <Route path="/susu" element={<Protected><SusuListPage /></Protected>} />
        <Route path="/susu/create" element={<Protected><SusuCreatePage /></Protected>} />
        <Route path="/susu/:slug" element={<Protected><SusuDetail /></Protected>} />
        <Route path="/settings/payout" element={<Protected><PayoutSettings /></Protected>} />
        <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="/p/:slug" element={<PublicCampaign />} />
        <Route path="/p/:slug/decline" element={<DeclinePage />} />
        <Route path="/o/:slug" element={<PublicOrgPage />} />
        <Route path="/s/:slug" element={<PublicSusu />} />
        <Route path="/join/:token" element={<JoinOrg />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <InstallPrompt />
    </BrowserRouter>
  )
}
