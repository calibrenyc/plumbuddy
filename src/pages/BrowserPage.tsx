import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Compass, Download, Edit3, ExternalLink, Folder, Home, Link2, RefreshCw, ShieldCheck, Sparkles, Star, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { categoryLabel, organizedLocations } from '../lib/categories';
import { recommendLocation } from '../lib/recommendLocation';
import { openBrowserUrl } from '../lib/navigation';
import type { BrowserDownloadRequest } from '../types';

const homeUrl = 'https://www.curseforge.com/sims4';
const quickLinks = [
  { label: 'CurseForge', url: 'https://www.curseforge.com/sims4' },
  { label: 'Mod The Sims', url: 'https://modthesims.info/downloads/ts4/' },
  { label: 'The Sims Resource', url: 'https://www.thesimsresource.com/downloads/browse/category/sims4/' },
  { label: 'GitHub Sims 4', url: 'https://github.com/topics/sims4' },
];
const favoritesKey = 'plumbuddy.browser.favorites';
const tabsKey = 'plumbuddy.browser.tabs';

interface BrowserFavorite {
  id: string;
  label: string;
  url: string;
}

interface BrowserTab {
  id: string;
  title: string;
  url: string;
}

const starterFavorites: BrowserFavorite[] = [
  { id: 'fav-wickedwhims', label: 'WickedWhims', url: 'https://wickedwhimsmod.com/download' },
  { id: 'fav-twistedmexi', label: 'TwistedMexi', url: 'https://twistedmexi.com/Mods/' },
  { id: 'fav-mccc', label: 'MCCC', url: 'https://deaderpool-mccc.com/downloads.html' },
];

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return homeUrl;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${trimmed} Sims 4 mod`)}`;
}

function loadFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(favoritesKey) ?? 'null') as BrowserFavorite[] | null;
    if (stored) return stored;
  } catch {
    // Fall through to starter favorites.
  }
  localStorage.setItem(favoritesKey, JSON.stringify(starterFavorites));
  return starterFavorites;
}

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ');
  } catch {
    return 'Favorite';
  }
}

function loadTabs(): { tabs: BrowserTab[]; activeTabId: string } {
  try {
    const stored = JSON.parse(localStorage.getItem(tabsKey) ?? 'null') as { tabs: BrowserTab[]; activeTabId: string } | null;
    if (stored?.tabs?.length) return stored;
  } catch {
    // Fall through to default tab.
  }
  const tab = { id: crypto.randomUUID(), title: 'CurseForge', url: homeUrl };
  return { tabs: [tab], activeTabId: tab.id };
}

export function BrowserPage() {
  const { settings, scan, queueDownload, addActivity } = useApp();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const initialTabs = useMemo(loadTabs, []);
  const [tabs, setTabs] = useState<BrowserTab[]>(initialTabs.tabs);
  const [activeTabId, setActiveTabId] = useState(initialTabs.activeTabId);
  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? tabs[0];
  const [address, setAddress] = useState(activeTab?.url ?? homeUrl);
  const [currentUrl, setCurrentUrl] = useState(activeTab?.url ?? homeUrl);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<BrowserDownloadRequest | null>(null);
  const [favorites, setFavorites] = useState<BrowserFavorite[]>(loadFavorites);
  const [editingFavorite, setEditingFavorite] = useState<BrowserFavorite | null>(null);
  const [favoriteLabel, setFavoriteLabel] = useState('');
  const [embeddedBrowserEnabled, setEmbeddedBrowserEnabled] = useState(false);
  const [location, setLocation] = useState('Uncategorized');
  const [customPath, setCustomPath] = useState<string | null>(null);
  const recommended = useMemo(() => recommendLocation(`${pendingDownload?.filename ?? ''} ${pendingDownload?.url ?? ''}`), [pendingDownload]);
  const installPath = customPath ?? `${settings?.modsFolder ?? ''}\\${location}`;
  const installConflict = useMemo(() => {
    const fileName = pendingDownload?.filename?.toLowerCase();
    if (!fileName || !/\.(package|ts4script|cfg|zip)$/i.test(fileName)) return null;
    return scan?.files.find(file => file.name.toLowerCase() === fileName) ?? null;
  }, [pendingDownload, scan]);

  useEffect(() => {
    localStorage.setItem(tabsKey, JSON.stringify({ tabs, activeTabId }));
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!activeTab) return;
    setAddress(activeTab.url);
    setCurrentUrl(activeTab.url);
  }, [activeTabId, activeTab?.url]);

  useEffect(() => {
    return api.onBrowserDownloadRequest(request => {
      setPendingDownload(request);
      setLocation(recommendLocation(`${request.filename} ${request.url}`));
      setCustomPath(null);
    });
  }, []);

  useEffect(() => api.onBrowserOpenTab(url => openNewTab(url, true)), []);

  useEffect(() => {
    const openUrl = (event: Event) => navigate((event as CustomEvent<string>).detail);
    window.addEventListener('plumbuddy:browser-url', openUrl);
    const pendingUrl = sessionStorage.getItem('plumbuddy.browser.pendingUrl');
    if (pendingUrl) {
      sessionStorage.removeItem('plumbuddy.browser.pendingUrl');
      navigate(pendingUrl);
    }
    return () => window.removeEventListener('plumbuddy:browser-url', openUrl);
  }, []);

  useEffect(() => api.onBrowserViewState(state => {
    const url = state.url || currentUrl;
    setTabs(current => current.map(item => item.id === activeTabId ? { ...item, url, title: state.title || labelFromUrl(url) } : item));
    setCurrentUrl(url);
    setAddress(url);
    setCanBack(state.canGoBack);
    setCanForward(state.canGoForward);
  }), [activeTabId, currentUrl]);

  useEffect(() => {
    if (!embeddedBrowserEnabled || !activeTab) {
      void api.hideBrowserView();
      return;
    }
    let disposed = false;
    const readBounds = () => {
      const box = viewportRef.current?.getBoundingClientRect();
      if (!box) return null;
      return { x: box.left, y: box.top, width: box.width, height: box.height, scaleFactor: window.devicePixelRatio || 1 };
    };
    const syncBounds = () => {
      const bounds = readBounds();
      if (!bounds || disposed) return;
      void api.setBrowserViewBounds(bounds);
    };
    const show = () => {
      const bounds = readBounds();
      if (!bounds || disposed) return;
      void api.showBrowserView(activeTab.url, bounds);
    };
    requestAnimationFrame(show);
    const settleTimers = [80, 250, 600, 1200].map(delay => window.setTimeout(syncBounds, delay));
    const resizeObserver = new ResizeObserver(syncBounds);
    if (viewportRef.current) resizeObserver.observe(viewportRef.current);
    window.addEventListener('resize', syncBounds);
    return () => {
      disposed = true;
      settleTimers.forEach(timer => window.clearTimeout(timer));
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncBounds);
      void api.hideBrowserView();
    };
  }, [embeddedBrowserEnabled, activeTabId]);

  function openNewTab(url = homeUrl, activate = true) {
    const normalized = normalizeUrl(url);
    const tab = { id: crypto.randomUUID(), title: labelFromUrl(normalized), url: normalized };
    setTabs(current => [...current, tab]);
    if (activate) setActiveTabId(tab.id);
  }

  function closeTab(id: string) {
    setTabs(current => {
      if (current.length === 1) return current;
      const index = current.findIndex(tab => tab.id === id);
      const next = current.filter(tab => tab.id !== id);
      if (id === activeTabId) setActiveTabId(next[Math.max(0, index - 1)]?.id ?? next[0].id);
      return next;
    });
  }

  function navigate(url: string) {
    const next = normalizeUrl(url);
    setAddress(next);
    setCurrentUrl(next);
    if (activeTab) setTabs(current => current.map(tab => tab.id === activeTab.id ? { ...tab, url: next, title: labelFromUrl(next) } : tab));
    if (embeddedBrowserEnabled) void api.navigateBrowserView(next);
  }

  function saveFavorites(next: BrowserFavorite[]) {
    setFavorites(next);
    localStorage.setItem(favoritesKey, JSON.stringify(next));
  }

  function toggleFavorite() {
    const normalizedCurrent = normalizeUrl(currentUrl);
    const existing = favorites.find(favorite => favorite.url.toLowerCase() === normalizedCurrent.toLowerCase());
    if (existing) {
      saveFavorites(favorites.filter(favorite => favorite.id !== existing.id));
      return;
    }
    saveFavorites([{ id: crypto.randomUUID(), label: labelFromUrl(normalizedCurrent), url: normalizedCurrent }, ...favorites].slice(0, 18));
  }

  function openRenameFavorite(favorite: BrowserFavorite) {
    setEditingFavorite(favorite);
    setFavoriteLabel(favorite.label);
  }

  function renameFavorite() {
    if (!editingFavorite) return;
    const nextLabel = favoriteLabel.trim() || labelFromUrl(editingFavorite.url);
    saveFavorites(favorites.map(favorite => favorite.id === editingFavorite.id ? { ...favorite, label: nextLabel } : favorite));
    setEditingFavorite(null);
    setFavoriteLabel('');
  }

  async function chooseCustomFolder() {
    const selected = await api.chooseFolder('Choose where to install this mod', installPath);
    if (selected) setCustomPath(selected);
  }

  async function installDownload(replaceExisting = false) {
    if (!settings || !pendingDownload) return;
    const request = pendingDownload;
    setPendingDownload(null);
    await queueDownload({ url: request.url, category: customPath ? 'Custom folder' : categoryLabel(location), installPath, replaceExisting });
    await addActivity({ type: 'download', title: replaceExisting ? 'Browser update download started' : 'Browser download started', detail: `${request.filename} -> ${customPath ? 'Custom folder' : categoryLabel(location)}` });
  }

  if (!settings) return null;

  return <>
    <section className="browser-shell">
      <div className="browser-toolbar">
        <button aria-label="Back" disabled={!canBack} onClick={() => void api.commandBrowserView('back')}><ArrowLeft size={17} /></button>
        <button aria-label="Forward" disabled={!canForward} onClick={() => void api.commandBrowserView('forward')}><ArrowRight size={17} /></button>
        <button aria-label="Reload" onClick={() => void api.commandBrowserView('reload')}><RefreshCw size={17} /></button>
        <button aria-label="Home" onClick={() => navigate(homeUrl)}><Home size={17} /></button>
        <form onSubmit={event => { event.preventDefault(); navigate(address); }}><Link2 size={17} /><input aria-label="Browser address" value={address} onChange={event => setAddress(event.target.value)} /></form>
        <button aria-label="Favorite current page" className={favorites.some(favorite => favorite.url.toLowerCase() === normalizeUrl(currentUrl).toLowerCase()) ? 'active' : ''} onClick={toggleFavorite}><Star size={17} /></button>
      </div>
      <div className="browser-tabs">{tabs.map(tab => <button key={tab.id} className={tab.id === activeTabId ? 'active' : ''} onClick={() => setActiveTabId(tab.id)}><span>{tab.title || labelFromUrl(tab.url)}</span>{tabs.length > 1 && <i onClick={event => { event.stopPropagation(); closeTab(tab.id); }}><X size={12} /></i>}</button>)}<button className="new-tab" onClick={() => openNewTab()} aria-label="New browser tab">+</button></div>
      <div className="browser-links">{quickLinks.map(link => <button key={link.url} className={currentUrl.startsWith(link.url) ? 'active' : ''} onClick={() => navigate(link.url)}><Compass size={14} /> {link.label}</button>)}{favorites.map(favorite => <span className="browser-favorite" key={favorite.id}><button className={currentUrl.startsWith(favorite.url) ? 'active' : ''} onClick={() => navigate(favorite.url)}><Star size={14} /> {favorite.label}</button><button aria-label={`Rename ${favorite.label}`} onClick={() => openRenameFavorite(favorite)}><Edit3 size={12} /></button><button aria-label={`Remove ${favorite.label}`} onClick={() => saveFavorites(favorites.filter(item => item.id !== favorite.id))}><X size={12} /></button></span>)}</div>
      <div className="browser-view-stack" ref={viewportRef}>
        {!embeddedBrowserEnabled && <div className="browser-safe-start">
          <span><Compass size={26} /></span>
          <h2>Browser ready</h2>
          <p>The embedded browser is paused so it cannot blank the app. Open it here when you are ready, or launch the current site externally.</p>
          <div>
            <button className="button primary" onClick={() => setEmbeddedBrowserEnabled(true)}>Open embedded browser</button>
            <button className="button ghost" onClick={() => api.openExternal(currentUrl)}><ExternalLink size={15} /> Open outside Plumbuddy</button>
          </div>
        </div>}
        {embeddedBrowserEnabled && <div className="browser-native-placeholder"><span>Embedded browser loaded</span></div>}
      </div>
    </section>
    {pendingDownload && <Modal title="Install browser download" subtitle={pendingDownload.filename || 'A mod download was detected.'} onClose={() => setPendingDownload(null)}>
      <div className="recommended-box"><span><Sparkles size={15} /> RECOMMENDED</span><strong>{categoryLabel(recommended)}</strong><p>Based on the filename and download link.</p></div>
      <label className="field-label" htmlFor="browser-install-location">Install location</label>
      <select id="browser-install-location" className="location-select" value={location} onChange={event => { setLocation(event.target.value); setCustomPath(null); }}>{organizedLocations.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select>
      <button className="custom-folder-button" onClick={chooseCustomFolder}><Folder size={16} /><span><strong>{customPath ? 'Custom folder selected' : 'Choose another folder'}</strong><small>{installPath}</small></span></button>
      {installConflict && <div className="conflict-warning"><AlertTriangle size={17} /><span><strong>You may already have this mod</strong><small>{installConflict.relativePath}</small><small>If this is an update, replace it. If it was a mistake, skip the download.</small></span></div>}
      <div className="modal-note"><ShieldCheck size={17} /><span>Plumbuddy will download this in the background. ZIP files are extracted and deleted after success, so you can keep browsing.</span></div>
      <div className="modal-actions"><button className="button ghost" onClick={() => setPendingDownload(null)}>Cancel</button>{installConflict && <button className="button subtle" onClick={() => setPendingDownload(null)}>Skip download</button>}<button className="button primary" onClick={() => void installDownload(Boolean(installConflict))}><Download size={16} /> {installConflict ? 'Download and replace' : 'Install here'}</button></div>
    </Modal>}
    {editingFavorite && <Modal title="Rename favorite" subtitle={editingFavorite.url} onClose={() => setEditingFavorite(null)}>
      <label className="field-label" htmlFor="favorite-label">Favorite name</label>
      <input id="favorite-label" className="text-input" autoFocus value={favoriteLabel} onChange={event => setFavoriteLabel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') renameFavorite(); }} />
      <div className="modal-actions"><button className="button ghost" onClick={() => setEditingFavorite(null)}>Cancel</button><button className="button primary" onClick={renameFavorite}>Save name</button></div>
    </Modal>}
  </>;
}

