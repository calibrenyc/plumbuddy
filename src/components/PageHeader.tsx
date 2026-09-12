import { Bell, Download, Globe2, House, LibraryBig, PackageOpen, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from './Modal';

const searchTargets = [
  { label: 'Home', detail: 'Overview and quick actions', page: 'home', icon: House },
  { label: 'Browser', detail: 'Browse and install from mod sites', page: 'browser', icon: Globe2 },
  { label: 'My Mods', detail: 'Search your installed files', page: 'mods', icon: LibraryBig },
  { label: 'Mod Packs', detail: 'Manage and compare setups', page: 'packs', icon: PackageOpen },
  { label: 'Downloads', detail: 'View your real download queue', page: 'downloads', icon: Download },
];

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTargets.filter(item => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  function navigate(page: string) {
    window.dispatchEvent(new CustomEvent('plumbuddy:navigate', { detail: page }));
    setSearchOpen(false); setQuery('');
  }
  return <><header className="page-header">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    <div className="header-actions">{actions}<button className="icon-button" aria-label="Search" onClick={() => setSearchOpen(true)}><Search size={19} /></button><button className="icon-button notification" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}><Bell size={19} /><span /></button></div>
  </header>
  {searchOpen && <Modal title="Search Plumbuddy" subtitle="Jump directly to a part of your collection." onClose={() => setSearchOpen(false)}><div className="modal-search"><Search size={18} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pages and tools…" /></div><div className="search-results">{results.map(({ label, detail, page, icon: Icon }) => <button key={page} onClick={() => navigate(page)}><Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span></button>)}{!results.length && <p>No matching tools found.</p>}</div></Modal>}
  {notificationsOpen && <Modal title="Notifications" subtitle="Updates from your local collection." onClose={() => setNotificationsOpen(false)}><div className="notifications-empty"><span><Bell size={22} /></span><strong>You’re all caught up</strong><p>Scan results, finished downloads, and backup updates will appear here.</p></div><div className="modal-actions"><button className="button primary" onClick={() => setNotificationsOpen(false)}>Done</button></div></Modal>}
  </>;
}
