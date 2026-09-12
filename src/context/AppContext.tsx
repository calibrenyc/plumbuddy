import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, demoScan } from '../lib/api';
import type { ActivityRecord, AppSettings, AppUpdateInfo, BackupRecord, DownloadRecord, ModPackRecord, ScanResult } from '../types';

interface AppContextValue {
  settings: AppSettings | null;
  scan: ScanResult | null;
  backups: BackupRecord[];
  packs: ModPackRecord[];
  downloads: DownloadRecord[];
  activities: ActivityRecord[];
  appUpdate: AppUpdateInfo | null;
  updateError: string | null;
  busy: string | null;
  toast: string | null;
  updateSettings(update: Partial<AppSettings>): Promise<void>;
  runScan(): Promise<void>;
  runBackup(): Promise<void>;
  createPack(name: string): Promise<void>;
  updatePack(packId: string): Promise<ModPackRecord>;
  refreshPacks(): Promise<void>;
  switchPack(packId: string): Promise<void>;
  launchGame(): Promise<void>;
  queueDownload(input: { url: string; category: string; installPath: string; replaceExisting?: boolean }): Promise<void>;
  cancelDownload(id: string): Promise<void>;
  retryDownload(id: string): Promise<void>;
  clearFinishedDownloads(): void;
  addActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>): Promise<void>;
  checkAppUpdate(silent?: boolean): Promise<AppUpdateInfo | null>;
  installAppUpdate(update?: AppUpdateInfo): Promise<void>;
  clearToast(): void;
}

const AppContext = createContext<AppContextValue | null>(null);

function hexToRgb(value: string) {
  const match = value.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)];
}

function rgbToHex(rgb: number[]) {
  return `#${rgb.map(value => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(color: string, target: string, amount: number) {
  const source = hexToRgb(color);
  const destination = hexToRgb(target);
  if (!source || !destination) return target;
  return rgbToHex(source.map((channel, index) => channel * (1 - amount) + destination[index] * amount));
}

function relativeLuminance(color: string) {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  const [red, green, blue] = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(window.modManager ? null : demoScan);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [packs, setPacks] = useState<ModPackRecord[]>([]);
  const [downloads, setDownloads] = useState<DownloadRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('plumbuddy.downloads') ?? '[]'); }
    catch { return []; }
  });
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.getSettings(), api.listBackups(), api.listModPacks(), api.listActivities(), api.getLastScan()]).then(([s, b, p, a, lastScan]) => {
      setSettings(s); setBackups(b); setPacks(p); setActivities(a); setScan(lastScan ?? (window.modManager ? null : demoScan));
      if (window.modManager) {
        void api.inferActiveModPack(s.modsFolder).then(async active => {
          if (!active || active.id === s.activePackId) return;
          const next = await api.saveSettings({ activePackId: active?.id });
          setSettings(next);
          setPacks(await api.listModPacks());
        }).catch(() => undefined);
      }
    });
  }, []);
  useEffect(() => {
    if (!settings || !window.modManager) return;
    const timer = window.setTimeout(() => {
      void checkAppUpdate(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [settings?.onboardingComplete]);
  useEffect(() => { localStorage.setItem('plumbuddy.downloads', JSON.stringify(downloads)); }, [downloads]);
  useEffect(() => {
    if (!settings || !window.modManager) return;
    let active = true;
    void api.watchModsFolder(settings.modsFolder).catch(error => {
      if (active) setToast(error instanceof Error ? error.message : 'Could not watch your Mods folder');
    });
    const unsubscribe = api.onModsFolderChanged(result => {
      if (!active) return;
      setScan(result);
      setToast(`Mods folder updated — ${result.files.length} files checked`);
      void api.addActivity({ type: 'scan', title: 'Mods folder updated automatically', detail: `${result.files.length} files indexed from a folder change` })
        .then(record => setActivities(current => [record, ...current].slice(0, 100)))
        .catch(() => undefined);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [settings?.modsFolder]);
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const applyTheme = () => {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolvedTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
      root.dataset.theme = resolvedTheme;
      root.dataset.accent = settings.accentTheme ?? 'lime';
      if (settings.accentTheme === 'custom' && settings.accentColor) {
        const rgb = hexToRgb(settings.accentColor);
        root.style.setProperty('--accent', settings.accentColor);
        root.style.setProperty('--accent-rgb', rgb ? rgb.join(', ') : '132, 214, 81');
      } else {
        root.style.removeProperty('--accent');
        root.style.removeProperty('--accent-rgb');
      }
      if (settings.uiColor) {
        const brightUi = relativeLuminance(settings.uiColor) > 0.38;
        if (resolvedTheme === 'dark') {
          root.style.setProperty('--app-bg', mixHex(settings.uiColor, '#050807', 0.58));
          root.style.setProperty('--panel', mixHex(settings.uiColor, '#111712', 0.32));
          root.style.setProperty('--surface-soft', mixHex(settings.uiColor, '#263026', 0.25));
          root.style.setProperty('--sidebar', mixHex(settings.uiColor, '#050706', 0.55));
        } else {
          root.style.setProperty('--app-bg', mixHex(settings.uiColor, '#f7f8f4', 0.88));
          root.style.setProperty('--panel', mixHex(settings.uiColor, '#ffffff', 0.95));
          root.style.setProperty('--surface-soft', mixHex(settings.uiColor, '#f4f6f1', 0.88));
          root.style.setProperty('--sidebar', mixHex(settings.uiColor, '#111712', 0.24));
        }
        if (brightUi) {
          root.style.setProperty('--ink', '#111714');
          root.style.setProperty('--muted', '#303b34');
          root.style.setProperty('--line', mixHex(settings.uiColor, '#465046', 0.55));
        } else if (resolvedTheme === 'dark') {
          root.style.setProperty('--ink', '#f1f7f1');
          root.style.setProperty('--muted', '#c3cec5');
          root.style.setProperty('--line', '#343d35');
        } else {
          root.style.setProperty('--ink', '#111714');
          root.style.setProperty('--muted', '#4f5b53');
          root.style.setProperty('--line', mixHex(settings.uiColor, '#cfd7cf', 0.72));
        }
      }
      root.style.setProperty('--text-scale', String(settings.textScale ?? 1));
      document.body.style.removeProperty('zoom');
      root.style.colorScheme = resolvedTheme;
    };
    applyTheme();
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [settings]);

  async function updateSettings(update: Partial<AppSettings>) {
    const folderChanged = update.modsFolder !== undefined && update.modsFolder !== settings?.modsFolder;
    const next = await api.saveSettings(update); setSettings(next);
    if (folderChanged) setScan(null);
  }
  async function addActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>) {
    const record = await api.addActivity(activity);
    setActivities(current => [record, ...current].slice(0, 100));
  }
  async function checkAppUpdate(silent = false) {
    if (!silent) setBusy('Checking for app updates...');
    setUpdateError(null);
    try {
      const info = await api.checkAppUpdates();
      setAppUpdate(info);
      if (info.updateAvailable) {
        setToast(`Plumbuddy ${info.latestVersion} is available`);
        await addActivity({ type: 'settings', title: 'App update found', detail: `${info.currentVersion} -> ${info.latestVersion}` });
      } else if (!silent) {
        setToast(`Plumbuddy ${info.currentVersion} is up to date`);
        await addActivity({ type: 'settings', title: 'App is up to date', detail: `Running ${info.currentVersion}` });
      }
      return info;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not check for app updates';
      setUpdateError(message);
      if (!silent) setToast(message);
      return null;
    } finally {
      if (!silent) setBusy(null);
    }
  }
  async function installAppUpdate(update = appUpdate ?? undefined) {
    if (!update) return;
    setBusy('Downloading app update...');
    setUpdateError(null);
    try {
      await api.downloadAndInstallAppUpdate(update, settings?.appInstallFolder);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not install the update';
      setUpdateError(message);
      setToast(message);
      setBusy(null);
    }
  }
  async function runScan() {
    if (!settings) return;
    setBusy('Scanning your Mods folder…');
    try { const result = await api.scanMods(settings.modsFolder); setScan(result); setToast(`Scan complete — ${result.files.length} mod files checked`); await addActivity({ type: 'scan', title: 'Mods folder scanned', detail: `${result.files.length} files checked · ${result.duplicateGroups + result.depthIssues} issues found` }); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not scan this folder'); }
    finally { setBusy(null); }
  }
  async function runBackup() {
    if (!settings) return;
    setBusy('Creating a safe ZIP backup…');
    try { const record = await api.createBackup(settings.modsFolder, settings.backupStorage); setBackups(value => [record, ...value]); setToast('Backup created safely'); await addActivity({ type: 'backup', title: 'Safety backup created', detail: `${record.modCount} mods · stored as ${record.name}` }); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Backup could not be created'); }
    finally { setBusy(null); }
  }
  async function createPack(name: string) {
    if (!settings) return;
    setBusy('Building your mod pack manifest…');
    try { const record = await api.createModPack(name, settings.modsFolder, settings.packStorage); setPacks(value => [record, ...value]); setToast(`“${record.name}” is ready`); await addActivity({ type: 'pack', title: 'Mod pack created', detail: `${record.name} · ${record.fileCount} files` }); }
    catch (error) { setToast(error instanceof Error ? error.message : 'Mod pack could not be created'); }
    finally { setBusy(null); }
  }
  async function updatePack(packId: string) {
    if (!settings) throw new Error('Settings are still loading');
    setBusy('Updating your mod pack share file...');
    try {
      const record = await api.updateModPack(packId, settings.modsFolder);
      setPacks(value => [record, ...value.filter(pack => pack.id !== packId)]);
      setToast(`${record.name} v${record.version} is ready to share`);
      await addActivity({ type: 'pack', title: 'Mod pack updated', detail: `${record.name} v${record.version} ready to share` });
      return record;
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Mod pack could not be updated');
      throw error;
    } finally {
      setBusy(null);
    }
  }
  async function refreshPacks() {
    const records = await api.listModPacks();
    setPacks(records);
    if (settings && window.modManager) {
      const active = await api.inferActiveModPack(settings.modsFolder);
      if (active && active.id !== settings.activePackId) {
        const next = await api.saveSettings({ activePackId: active?.id });
        setSettings(next);
      }
    }
  }
  async function switchPack(packId: string) {
    if (!settings) return;
    setBusy('Switching active mod pack...');
    try {
      const inferredActive = window.modManager ? await api.inferActiveModPack(settings.modsFolder).catch(() => null) : null;
      const result = await api.switchModPack(packId, settings.modsFolder, settings.backupStorage, settings.backupBeforeSwitching, inferredActive?.id ?? settings.activePackId);
      if (result.backup) setBackups(value => [result.backup!, ...value]);
      const next = await api.saveSettings({ activePackId: packId });
      setSettings(next);
      await refreshPacks();
      setToast(`${result.packName} is now active`);
      await addActivity({ type: 'pack', title: 'Mod pack activated', detail: `${result.packName} · ${result.activatedFiles} files ready for The Sims 4` });
      void api.scanMods(settings.modsFolder)
        .then(result => setScan(result))
        .catch(() => undefined);
      if (settings.launchAfterSwitch) await api.launchSims();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Mod pack could not be activated');
      throw error;
    } finally {
      setBusy(null);
    }
  }
  async function launchGame() {
    setBusy('Opening The Sims 4…');
    try { const result = await api.launchSims(); setToast(result.message); }
    catch { setToast('The Sims 4 installation could not be opened'); }
    finally { setBusy(null); }
  }
  async function startDownload(record: DownloadRecord) {
    if (!settings) return;
    setDownloads(current => current.map(item => item.id === record.id ? { ...item, state: 'downloading', error: undefined } : item));
    try {
      const result = await api.downloadFromUrl(record.id, record.url, settings.downloadsFolder, record.installPath, { replaceExisting: Boolean(record.replaceExisting) });
      setDownloads(current => current.map(item => item.id === record.id ? { ...item, title: result.name, filePath: result.filePath, size: result.size, state: result.state, extractedFiles: result.extractedFiles, archiveDeleted: result.archiveDeleted } : item));
      setToast(result.archiveDeleted ? `${result.extractedFiles} mod files installed; ZIP deleted` : result.state === 'installed' ? `${result.name} installed successfully` : `${result.name} downloaded — RAR/7Z extraction is not available yet`);
      await addActivity({ type: 'download', title: result.archiveDeleted ? 'ZIP extracted and installed' : result.state === 'installed' ? 'Mod installed' : 'Archive downloaded', detail: result.archiveDeleted ? `${result.extractedFiles} files installed · ZIP deleted` : `${result.name} · ${record.category}` });
      void api.scanMods(settings.modsFolder)
        .then(async result => {
          setScan(result);
          await refreshPacks();
        })
        .catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed';
      const cancelled = message.toLowerCase().includes('cancel');
      setDownloads(current => current.map(item => item.id === record.id ? { ...item, state: cancelled ? 'cancelled' : 'failed', error: message } : item));
      setToast(message);
    }
  }
  async function queueDownload(input: { url: string; category: string; installPath: string; replaceExisting?: boolean }) {
    const parsed = new URL(input.url);
    const pathName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
    const record: DownloadRecord = {
      id: crypto.randomUUID(), title: pathName || `Download from ${parsed.hostname}`, url: input.url,
      source: parsed.hostname.replace(/^www\./, ''), category: input.category, installPath: input.installPath,
      replaceExisting: input.replaceExisting,
      state: 'downloading', createdAt: new Date().toISOString(),
    };
    setDownloads(current => [record, ...current]);
    await startDownload(record);
  }
  async function cancelDownload(id: string) {
    await api.cancelDownload(id);
    setDownloads(current => current.map(item => item.id === id ? { ...item, state: 'cancelled', error: 'Cancelled by you' } : item));
  }
  async function retryDownload(id: string) {
    const record = downloads.find(item => item.id === id);
    if (record) await startDownload(record);
  }
  function clearFinishedDownloads() {
    setDownloads(current => current.filter(item => item.state === 'downloading'));
  }

  const value = useMemo(() => ({ settings, scan, backups, packs, downloads, activities, appUpdate, updateError, busy, toast, updateSettings, runScan, runBackup, createPack, updatePack, refreshPacks, switchPack, launchGame, queueDownload, cancelDownload, retryDownload, clearFinishedDownloads, addActivity, checkAppUpdate, installAppUpdate, clearToast: () => setToast(null) }), [settings, scan, backups, packs, downloads, activities, appUpdate, updateError, busy, toast]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
