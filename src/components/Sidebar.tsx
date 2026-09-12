import { Archive, Boxes, CircleAlert, Compass, Download, Globe2, House, LibraryBig, PackageOpen, PanelLeftClose, PanelLeftOpen, Settings, Sparkles } from 'lucide-react';
import { Brand } from './Brand';
import { useApp } from '../context/AppContext';

export type PageId = 'home' | 'discover' | 'browser' | 'bulk' | 'mods' | 'packs' | 'downloads' | 'backups' | 'issues' | 'settings';

const primary = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'browser', label: 'Browser', icon: Globe2 },
  { id: 'bulk', label: 'Bulk', icon: Boxes },
  { id: 'mods', label: 'My Mods', icon: LibraryBig },
  { id: 'packs', label: 'Mod Packs', icon: PackageOpen },
] as const;
const library = [
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'backups', label: 'Backups', icon: Archive },
  { id: 'issues', label: 'Issues', icon: CircleAlert },
] as const;

export function Sidebar({ page, collapsed, onNavigate, onToggleCollapsed }: { page: PageId; collapsed: boolean; onNavigate(page: PageId): void; onToggleCollapsed(): void }) {
  const { settings, scan } = useApp();
  const displayName = settings?.displayName?.trim() || 'Player';
  const initial = displayName.slice(0, 1).toUpperCase();
  const issueCount = scan ? new Set(scan.files.filter(file => file.duplicate).map(file => file.hash)).size + scan.files.filter(file => file.depthIssue || file.category === 'Uncategorized' || file.categoryMismatch).length : 0;
  const items = (group: readonly { id: PageId; label: string; icon: typeof House }[]) => group.map(item => {
    const Icon = item.icon;
    return <button key={item.id} data-testid={`nav-${item.id}`} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.id)}>
      <Icon size={18} strokeWidth={1.9} /><span>{item.label}</span>{item.id === 'issues' && issueCount > 0 && <em>{issueCount}</em>}
    </button>;
  });
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <button className="sidebar-collapse-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
    <Brand />
    <nav aria-label="Main navigation">
      <div className="nav-group">{items(primary)}</div>
      <span className="nav-label">LIBRARY</span>
      <div className="nav-group">{items(library)}</div>
    </nav>
    <div className="sidebar-footer">
      <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}><Settings size={18} /><span>Settings</span></button>
      <div className="profile"><span className="avatar">{initial}</span><div><strong>{displayName}</strong><small><Sparkles size={11} /> Ready to play</small></div><span className="online-dot" /></div>
    </div>
  </aside>;
}
