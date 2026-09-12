import { useEffect, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { useApp } from './context/AppContext';
import { Onboarding } from './components/Onboarding';
import { Sidebar, type PageId } from './components/Sidebar';
import { HomePage } from './pages/HomePage';
import { DiscoverPage } from './pages/DiscoverPage';
import { BrowserPage } from './pages/BrowserPage';
import { BulkPage } from './pages/BulkPage';
import { ModsPage } from './pages/ModsPage';
import { PacksPage } from './pages/PacksPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { BackupsPage } from './pages/BackupsPage';
import { IssuesPage } from './pages/IssuesPage';
import { SettingsPage } from './pages/SettingsPage';
import { api } from './lib/api';

export function App() {
  const { settings, busy, toast, clearToast } = useApp();
  const [page, setPage] = useState<PageId>('home');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const auditMode = new URLSearchParams(window.location.search).get('audit') === '1';
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(clearToast, 4000); return () => window.clearTimeout(timer); }, [toast, clearToast]);
  useEffect(() => {
    const navigate = (event: Event) => setPage((event as CustomEvent<PageId>).detail);
    window.addEventListener('plumbuddy:navigate', navigate);
    return () => window.removeEventListener('plumbuddy:navigate', navigate);
  }, []);
  useEffect(() => {
    if (page === 'browser') setSidebarCollapsed(true);
  }, [page]);
  useEffect(() => {
    if (!auditMode) return;
    const handleClick = (event: MouseEvent) => {
      const control = (event.target as HTMLElement).closest<HTMLElement>('button, a, [role="button"]');
      if (!control || control.hasAttribute('disabled')) return;
      const planned = control.dataset.planned === 'true';
      const label = (control.getAttribute('aria-label') || control.innerText || control.title || control.tagName)
        .trim().replace(/\s+/g, ' ').slice(0, 120);
      void api.auditClick({ label, page, planned, tag: control.tagName.toLowerCase() });
      control.dataset.auditMark = planned ? 'Not connected yet' : 'Click recorded';
      window.setTimeout(() => { if (control.isConnected) delete control.dataset.auditMark; }, planned ? 120_000 : 900);
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [auditMode, page]);
  if (!settings) return <div className="app-loading"><LoaderCircle className="spin" /></div>;
  if (!settings.onboardingComplete) return <><Onboarding />{auditMode && <div className="audit-ribbon"><span /> Click audit on</div>}</>;
  const pages = { home: <HomePage onNavigate={setPage} />, discover: <DiscoverPage onNavigate={setPage} />, browser: <BrowserPage />, bulk: <BulkPage />, mods: <ModsPage />, packs: <PacksPage />, downloads: <DownloadsPage />, backups: <BackupsPage />, issues: <IssuesPage />, settings: <SettingsPage /> };
  const showBusyOverlay = Boolean(busy && /scanning|switching|updating|building/i.test(busy));
  return <div className={`app-shell page-${page} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <div className="window-drag" />
    <Sidebar page={page} collapsed={sidebarCollapsed} onNavigate={setPage} onToggleCollapsed={() => setSidebarCollapsed(value => !value)} />
    <main className="content">{pages[page]}</main>
    {auditMode && <div className="audit-ribbon"><span /> Click audit on · controls are being recorded</div>}
    {showBusyOverlay && <div className="busy-overlay" role="status" aria-live="polite">
      <div className="busy-plumbob"><span /></div>
      <h2>{busy}</h2>
      <p>Large Mods folders can take a minute. Plumbuddy is still working.</p>
      <div className="busy-glow-track"><i /></div>
    </div>}
    {busy && !showBusyOverlay && <div className="busy-bar"><LoaderCircle size={17} className="spin" />{busy}</div>}
    {toast && <div className="toast"><span>{toast}</span><button onClick={clearToast} aria-label="Dismiss"><X size={16} /></button></div>}
  </div>;
}
