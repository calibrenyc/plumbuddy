import { Archive, Check, Download, Folder, FolderOpen, Monitor, Moon, PackageOpen, RefreshCw, Save, ShieldCheck, Sparkles, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import type { AppReleaseInfo, AppSettings } from '../types';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import type { AppUpdateInfo } from '../types';

const folderFields: Array<{ key: keyof Pick<AppSettings, 'modsFolder' | 'packStorage' | 'backupStorage' | 'downloadsFolder'>; label: string; detail: string; icon: typeof Folder }> = [
  { key: 'modsFolder', label: 'Sims 4 Mods folder', detail: 'The active folder read by your game', icon: Folder },
  { key: 'packStorage', label: 'Mod pack storage', detail: 'Local manifests and pack configurations', icon: PackageOpen },
  { key: 'backupStorage', label: 'Backup storage', detail: 'Recoverable ZIP archives', icon: Archive },
  { key: 'downloadsFolder', label: 'Download storage', detail: 'Temporary files awaiting installation', icon: Download },
];

const toggles: Array<{ key: keyof AppSettings; label: string; text: string }> = [
  { key: 'automaticOrganization', label: 'Automatic organization', text: 'Recommend categories for newly installed mods' },
  { key: 'highConfidenceAutoCategorization', label: 'Accept high-confidence categories', text: 'Skip confirmation only when Plumbuddy is very certain' },
  { key: 'backupBeforeSwitching', label: 'Backup before switching packs', text: 'Create a recoverable state before replacing active files' },
  { key: 'keepArchives', label: 'Keep downloaded archives', text: 'Retain ZIP files after a successful install' },
  { key: 'checkForUpdates', label: 'Check for mod updates', text: 'Look for new versions from recorded sources' },
];

const themeModes: Array<{ value: AppSettings['theme']; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const accentThemes: Array<{ value: AppSettings['accentTheme']; label: string; color: string; x: number; y: number }> = [
  { value: 'lime', label: 'Lime', color: '#84d651', x: 10, y: 82 },
  { value: 'sky', label: 'Sky', color: '#6fb7ff', x: 21, y: 82 },
  { value: 'violet', label: 'Violet', color: '#a783f6', x: 33, y: 82 },
  { value: 'lavender', label: 'Lavender', color: '#d6a6ee', x: 44, y: 82 },
  { value: 'rose', label: 'Rose', color: '#eaa0c0', x: 55, y: 82 },
  { value: 'coral', label: 'Coral', color: '#f28772', x: 66, y: 82 },
  { value: 'amber', label: 'Amber', color: '#f0a35b', x: 76, y: 82 },
  { value: 'gold', label: 'Gold', color: '#dec768', x: 84, y: 82 },
  { value: 'mint', label: 'Mint', color: '#5de0b2', x: 91, y: 82 },
  { value: 'teal', label: 'Teal', color: '#4bc0c0', x: 94, y: 58 },
  { value: 'slate', label: 'Slate', color: '#929db8', x: 92, y: 34 },
];

const uiPalettes = [
  { label: 'Soft Sage', color: '#dfead8', x: 18, y: 34 },
  { label: 'Cream', color: '#efe4cf', x: 9, y: 72 },
  { label: 'Blush', color: '#efd2db', x: 45, y: 70 },
  { label: 'Sky Mist', color: '#d7e7f4', x: 24, y: 64 },
  { label: 'Lilac', color: '#ddd4ef', x: 34, y: 58 },
  { label: 'Mint', color: '#cfeee1', x: 76, y: 60 },
  { label: 'Warm Clay', color: '#e5c7b8', x: 61, y: 74 },
  { label: 'Dark Steel', color: '#20262c', x: 90, y: 26 },
];

export function SettingsPage() {
  const { settings, updateSettings, addActivity, checkAppUpdate, installAppUpdate } = useApp();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [saved, setSaved] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [releases, setReleases] = useState<AppReleaseInfo[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [updateError, setUpdateError] = useState('');
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => { void loadReleases(true); }, []);
  if (!draft) return null;

  async function browse(key: typeof folderFields[number]['key']) {
    const selected = await api.chooseFolder('Choose a folder', draft![key]);
    if (selected) {
      setDraft(value => value ? { ...value, [key]: selected } : value);
      await updateSettings({ [key]: selected });
      const label = folderFields.find(field => field.key === key)?.label ?? 'Storage folder';
      await addActivity({ type: 'settings', title: `${label} changed`, detail: selected });
      setSaved(true); window.setTimeout(() => setSaved(false), 2200);
    }
  }

  async function save() { await updateSettings(draft!); setSaved(true); window.setTimeout(() => setSaved(false), 2200); }

  async function updateAppearance(update: Partial<Pick<AppSettings, 'theme' | 'accentTheme' | 'accentColor' | 'accentX' | 'accentY' | 'uiColor' | 'uiX' | 'uiY' | 'textScale'>>) {
    setDraft(value => value ? { ...value, ...update } : value);
    await updateSettings(update);
    setSaved(true); window.setTimeout(() => setSaved(false), 2200);
  }

  async function checkUpdates() {
    setCheckingUpdate(true);
    setUpdateError('');
    try {
      const info = await api.checkAppUpdates();
      await checkAppUpdate(true);
      setUpdateInfo(info);
      await addActivity({ type: 'settings', title: info.updateAvailable ? 'App update found' : 'App is up to date', detail: info.updateAvailable ? `${info.currentVersion} -> ${info.latestVersion}` : `Running ${info.currentVersion}` });
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Could not check GitHub for updates');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function loadReleases(silent = false) {
    if (!silent) setLoadingReleases(true);
    setUpdateError('');
    try {
      setReleases(await api.listAppReleases());
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Could not load GitHub releases');
    } finally {
      if (!silent) setLoadingReleases(false);
    }
  }

  async function installRelease(release: AppReleaseInfo) {
    const current = await api.checkAppUpdates().catch(() => updateInfo);
    const update = {
      currentVersion: current?.currentVersion ?? 'unknown',
      latestVersion: release.version,
      updateAvailable: release.updateAvailable,
      releaseName: release.name,
      releaseNotes: release.notes,
      releaseUrl: release.url,
      downloadUrl: release.downloadUrl,
      assetName: release.assetName,
      publishedAt: release.publishedAt,
    };
    setUpdateInfo(update);
    await installAppUpdate({ ...update, updateAvailable: true });
  }

  async function installUpdate() {
    if (!updateInfo) return;
    setInstallingUpdate(true);
    setUpdateError('');
    try {
      await installAppUpdate(updateInfo);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'Could not install the update');
      setInstallingUpdate(false);
    }
  }

  return <>
    <PageHeader eyebrow="MAKE IT YOURS" title="Settings" description="Paths, safety preferences, and how Plumbuddy handles your collection." actions={<button className="button primary" onClick={save}>{saved ? <Check size={16} /> : <Save size={16} />}{saved ? 'Saved' : 'Save changes'}</button>} />
    <section className="settings-card profile-settings"><div className="settings-heading"><span><Sparkles size={19} /></span><div><h2>Profile</h2><p>This is how Plumbuddy labels your local setup.</p></div></div><label className="profile-name-field" htmlFor="display-name"><strong>Display name</strong><input id="display-name" className="text-input" value={draft.displayName ?? ''} onChange={event => setDraft(value => value ? { ...value, displayName: event.target.value } : value)} onBlur={() => void updateSettings({ displayName: (draft.displayName || 'Player').trim() || 'Player' })} placeholder="Your name" /></label></section>
    <section className="settings-card update-settings"><div className="settings-heading"><span><Download size={19} /></span><div><h2>App updates</h2><p>Checks GitHub Releases for portable builds users can install at the end of the day.</p></div></div><div className="update-row"><div><strong>Portable release channel</strong><small>When you publish a new GitHub release, users can check here and download the newest EXE.</small>{updateError && <p className="form-error">{updateError}</p>}</div><button className="button primary" disabled={checkingUpdate} onClick={() => void checkUpdates()}><RefreshCw size={15} className={checkingUpdate ? 'spin' : ''} /> {checkingUpdate ? 'Checking...' : 'Check for app updates'}</button></div><div className="release-list-head"><strong>Application versions</strong><button className="button ghost" disabled={loadingReleases} onClick={() => void loadReleases()}><RefreshCw size={14} className={loadingReleases ? 'spin' : ''} /> Refresh list</button></div><div className="release-list">{releases.length ? releases.map(release => <article key={release.url}><div><strong>{release.name}</strong><small>{release.publishedAt ? new Date(release.publishedAt).toLocaleDateString() : 'Unpublished date'} · {release.assetName ?? 'No EXE attached'}</small>{release.notes && <p>{release.notes.slice(0, 180)}</p>}</div><span className={release.updateAvailable ? 'available' : 'current'}>{release.updateAvailable ? 'Update' : 'Installed/older'}</span><button className="button ghost" onClick={() => void api.openExternal(release.url)}>Open</button>{release.downloadUrl && release.updateAvailable && <button className="button primary" onClick={() => void installRelease(release)}><Download size={14} /> Install</button>}</article>) : <div className="release-empty">{loadingReleases ? 'Loading application versions...' : 'No releases loaded yet.'}</div>}</div></section>
    <section className="settings-card"><div className="settings-heading"><span><FolderOpen size={19} /></span><div><h2>Storage locations</h2><p>Plumbuddy keeps these areas separate to protect your live game.</p></div></div><div className="folder-settings">{folderFields.map(({ key, label, detail, icon: Icon }) => <div className="folder-setting" key={key}><span className="setting-icon"><Icon size={18} /></span><div><strong>{label}</strong><small>{detail}</small><code>{draft[key]}</code></div><button onClick={() => browse(key)}>Browse</button></div>)}</div></section>
    <div className="settings-columns"><section className="settings-card"><div className="settings-heading"><span><Sparkles size={19} /></span><div><h2>Organization & safety</h2><p>Smart defaults with you in control.</p></div></div><div className="toggle-list">{toggles.map(toggle => <label key={toggle.key}><div><strong>{toggle.label}</strong><small>{toggle.text}</small></div><input type="checkbox" checked={Boolean(draft[toggle.key])} onChange={event => setDraft(value => value ? { ...value, [toggle.key]: event.target.checked } : value)} /><span className="switch" /></label>)}</div></section>
      <section className="settings-card compact-settings"><div className="settings-heading"><span><Moon size={19} /></span><div><h2>Appearance</h2><p>A comfortable view for every session.</p></div></div><div className="appearance-modes inline">{themeModes.map(mode => { const Icon = mode.icon; return <button key={mode.value} type="button" title={mode.label} aria-label={`${mode.label} theme`} aria-pressed={draft.theme === mode.value} className={draft.theme === mode.value ? 'active' : ''} onClick={() => void updateAppearance({ theme: mode.value })}><Icon size={16} /> {mode.label}</button>; })}</div><div className="swatch-section"><strong>Accent color</strong><div className="settings-swatches">{accentThemes.map(accent => <button key={accent.value} type="button" title={accent.label} aria-label={`${accent.label} accent`} aria-pressed={draft.accentTheme === accent.value} className={draft.accentTheme === accent.value ? 'active' : ''} style={{ background: accent.color }} onClick={() => void updateAppearance({ accentTheme: accent.value, accentColor: accent.color, accentX: accent.x, accentY: accent.y })} />)}</div></div><div className="swatch-section"><strong>UI color</strong><div className="ui-palette-grid">{uiPalettes.map(palette => <button key={palette.label} type="button" className={draft.uiColor?.toLowerCase() === palette.color.toLowerCase() ? 'active' : ''} onClick={() => void updateAppearance({ uiColor: palette.color, uiX: palette.x, uiY: palette.y })}><span style={{ background: palette.color }} />{palette.label}</button>)}</div></div><label className="scale-control"><span><strong>Text scale</strong><small>{Math.round((draft.textScale ?? 1) * 100)}%</small></span><input type="range" min="0.9" max="1.75" step="0.05" value={draft.textScale ?? 1} onChange={event => void updateAppearance({ textScale: Number(event.target.value) })} /></label><div className="protection-box"><ShieldCheck size={24} /><div><strong>File protection is on</strong><p>Destructive changes always require confirmation.</p></div></div><button className="reset-link" onClick={() => setDraft(value => value ? { ...value, onboardingComplete: false } : value)}><RefreshCw size={14} /> Run setup again</button></section></div>
    {updateInfo && <Modal title={updateInfo.updateAvailable ? 'App update available' : 'Plumbuddy is up to date'} subtitle={`Current ${updateInfo.currentVersion} · Latest ${updateInfo.latestVersion}`} onClose={() => setUpdateInfo(null)}>
      <div className="update-modal">
        <strong>{updateInfo.releaseName}</strong>
        {updateInfo.publishedAt && <small>Published {new Date(updateInfo.publishedAt).toLocaleString()}</small>}
        {updateInfo.releaseNotes && <p>{updateInfo.releaseNotes.slice(0, 900)}</p>}
        {updateInfo.updateAvailable ? <div className="modal-note"><Download size={17} /><span>{updateInfo.assetName ? `Plumbuddy will download ${updateInfo.assetName}, close itself, replace the old portable EXE, and restart.` : 'A release exists, but no portable EXE asset was attached yet.'}</span></div> : <div className="modal-note"><ShieldCheck size={17} /><span>You already have the latest published version.</span></div>}
        {updateError && <p className="form-error">{updateError}</p>}
      </div>
      <div className="modal-actions"><button className="button ghost" disabled={installingUpdate} onClick={() => setUpdateInfo(null)}>Close</button><button className="button subtle" disabled={installingUpdate} onClick={() => void api.openExternal(updateInfo.releaseUrl)}>Open release</button>{updateInfo.downloadUrl && updateInfo.updateAvailable && <button className="button primary" disabled={installingUpdate} onClick={() => void installUpdate()}><Download size={15} /> {installingUpdate ? 'Installing...' : 'Download & restart'}</button>}</div>
    </Modal>}
  </>;
}
