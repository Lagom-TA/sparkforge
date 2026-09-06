import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Index from './pages/Index';
import Workspace from './pages/Workspace';
import Share from './pages/Share';
import Settings from './pages/Settings';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/workspace/:projectId" element={<Workspace />} />
    <Route path="/share/:projectId/:token" element={<Share />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/auth/error" element={<AuthError />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster richColors position="top-right" />
      <BrowserRouter><AppRoutes /></BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };