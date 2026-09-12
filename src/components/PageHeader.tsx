import { Bell, Download, Globe2, House, LibraryBig, PackageOpen, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { useApp } from '../context/AppContext';

const searchTargets = [
  { label: 'Home', detail: 'Overview and quick actions', page: 'home', icon: House },
  { label: 'Browser', detail: 'Browse and install from mod sites', page: 'browser', icon: Globe2 },
  { label: 'My Mods', detail: 'Search your installed files', page: 'mods', icon: LibraryBig },
  { label: 'Mod Packs', detail: 'Manage and compare setups', page: 'packs', icon: PackageOpen },
  { label: 'Downloads', detail: 'View your real download queue', page: 'downloads', icon: Download },
];

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  const { appUpdate, updateError, checkAppUpdate, installAppUpdate } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTargets.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);

  function navigate(page: string) {
    window.dispatchEvent(new CustomEvent('plumbuddy:navigate', { detail: page }));
    setSearchOpen(false);
    setQuery('');
  }

  async function checkNow() {
    setChecking(true);
    await checkAppUpdate(false);
    setChecking(false);
  }

  async function installNow() {
    if (!appUpdate) return;
    setInstalling(true);
    await installAppUpdate(appUpdate);
    setInstalling(false);
  }

  return <>
    <header className="page-header">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
      <div className="header-actions">{actions}<button className="icon-button" aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={19} /></button><button className={`icon-button notification ${appUpdate?.updateAvailable ? 'has-update' : ''}`} aria-label="Notifications" onClick={() => setNotificationsOpen(true)}><Bell size={19} />{appUpdate?.updateAvailable && <span />}</button></div>
    </header>

    {searchOpen && <Modal title="Search Plumbuddy" subtitle="Jump directly to a part of your collection." onClose={() => setSearchOpen(false)}>
      <div className="modal-search"><Search size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages and tools..." /></div>
      <div className="search-results">{results.map(({ label, detail, page, icon: Icon }) => <button key={page} onClick={() => navigate(page)}><Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span></button>)}{!results.length && <p>No matching tools found.</p>}</div>
    </Modal>}

    {notificationsOpen && <Modal title="Notifications" subtitle="Updates from your local collection." onClose={() => setNotificationsOpen(false)}>
      {appUpdate?.updateAvailable ? <div className="update-modal">
        <strong>Plumbuddy {appUpdate.latestVersion} is ready</strong>
        <small>You are running {appUpdate.currentVersion}</small>
        {appUpdate.releaseNotes && <p>{appUpdate.releaseNotes.slice(0, 700)}</p>}
        <div className="modal-note"><Download size={17} /><span>Download the new portable, close Plumbuddy, swap the EXE, and restart automatically.</span></div>
      </div> : <div className="notifications-empty">
        <span>{updateError ? <Bell size={22} /> : <ShieldCheck size={22} />}</span>
        <strong>{updateError ? 'Update check needs another try' : 'You’re all caught up'}</strong>
        <p>{updateError ?? (appUpdate ? `Plumbuddy ${appUpdate.currentVersion} is the latest release.` : 'Plumbuddy checks for app updates when it opens. You can check again any time.')}</p>
      </div>}
      <div className="modal-actions"><button className="button ghost" disabled={checking || installing} onClick={() => setNotificationsOpen(false)}>Close</button><button className="button subtle" disabled={checking || installing} onClick={() => void checkNow()}><RefreshCw size={15} className={checking ? 'spin' : ''} /> {checking ? 'Checking...' : 'Check again'}</button>{appUpdate?.updateAvailable && <button className="button primary" disabled={installing} onClick={() => void installNow()}><Download size={15} /> {installing ? 'Installing...' : 'Download & restart'}</button>}</div>
    </Modal>}
  </>;
}
