import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import { watch, type FSWatcher } from 'node:fs';
import { access, appendFile, rm, writeFile } from 'node:fs/promises';
import type { AppSettings, DownloadOptions, ModMoveRequest, ScanResult } from '../src/types.js';
import { detectDefaultPaths } from './paths.js';
import { compareModPackManifest, createBackup, createModPack, inferActiveModPack, switchModPack, updateModPackManifest } from './operations.js';
import { scanMods } from './scanner.js';
import { cancelDownload, downloadFromUrl } from './downloader.js';
import { addActivity, deleteModPackRecord, getLastScan, getSettings, initializeDatabase, listActivities, listBackups, listModPacks, saveBackup, saveModPack, saveScan, saveSettings } from './database.js';
import { moveModsToCategory, moveModsToLocations, moveModToCategory, syncFolderLayoutFromManifests } from './modMover.js';
import { cancelCollabSync, connectHostedPack, discoverHostedPacks, fetchHostedManifest, installHostedPack, listHostTransfers, refreshPackHost, startPackHost, stopPackHost, syncCollabPacks } from './packHost.js';
import { trashDuplicateFiles } from './duplicateCleaner.js';
import { findEmptyFolders, removeEmptyFolders } from './emptyFolders.js';
import { installBulkZip, prepareBulkZip, prepareBulkZipFile, prepareBulkZipFiles } from './bulkInstaller.js';
import { checkAppUpdates } from './updater.js';

const currentDir = __dirname;
let defaults: AppSettings;
let lastScan: ScanResult | null = null;
let mainWindow: BrowserWindow | null = null;
let modsWatcher: FSWatcher | null = null;
let watchedModsFolder = '';
let watchScanTimer: NodeJS.Timeout | null = null;

const blockedHosts = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'adsystem.com', 'adnxs.com', 'adsrvr.org', 'criteo.com', 'taboola.com', 'outbrain.com',
  'scorecardresearch.com', 'quantserve.com', 'zedo.com', 'yieldmo.com', 'moatads.com',
  'facebook.net', 'hotjar.com', 'segment.io', 'fullstory.com',
];

function configureBrowserSession() {
  const browserSession = session.fromPartition('persist:plumbuddy-browser');
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const host = new URL(details.url).hostname.replace(/^www\./, '');
      callback({ cancel: blockedHosts.some(blocked => host === blocked || host.endsWith(`.${blocked}`)) });
    } catch {
      callback({ cancel: false });
    }
  });
  browserSession.on('will-download', (event, item) => {
    event.preventDefault();
    mainWindow?.webContents.send('browser:download-request', {
      url: item.getURL(),
      filename: item.getFilename(),
      mimeType: item.getMimeType(),
    });
  });
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(details => {
    mainWindow?.webContents.send('browser:open-tab', details.url);
    return { action: 'deny' };
  });
});

function scanBelongsToFolder(scan: ScanResult | null, folderPath: string) {
  if (!scan) return false;
  if (scan.files.length === 0) return false;
  const root = path.resolve(folderPath).toLowerCase();
  return scan.files.every(file => path.resolve(file.path).toLowerCase().startsWith(`${root}${path.sep}`));
}

async function runCachedScan(folderPath: string) {
  const previous = scanBelongsToFolder(lastScan, folderPath) ? lastScan : getLastScan(folderPath);
  lastScan = await scanMods(folderPath, previous);
  saveScan(lastScan, folderPath);
  return lastScan;
}

async function refreshActivePackFromScan(folderPath: string, scan: ScanResult) {
  const activePackId = getSettings(defaults).activePackId;
  if (!activePackId) return null;
  const pack = listModPacks().find(item => item.id === activePackId);
  if (!pack) return null;
  const record = await updateModPackManifest(pack, folderPath, scan);
  saveModPack(record);
  await refreshPackHost(record, folderPath).catch(() => undefined);
  return record;
}

function scheduleWatchedScan(folderPath: string) {
  if (watchScanTimer) clearTimeout(watchScanTimer);
  watchScanTimer = setTimeout(() => {
    void runCachedScan(folderPath)
      .then(async result => {
        await refreshActivePackFromScan(folderPath, result);
        mainWindow?.webContents.send('mods:folder-changed', result);
      })
      .catch(error => mainWindow?.webContents.send('mods:folder-watch-error', error instanceof Error ? error.message : 'Mods folder changed but could not be scanned'));
  }, 1600);
}

function startModsWatcher(folderPath: string) {
  const resolved = path.resolve(folderPath);
  if (modsWatcher && watchedModsFolder.toLowerCase() === resolved.toLowerCase()) return;
  modsWatcher?.close();
  modsWatcher = null;
  watchedModsFolder = resolved;
  modsWatcher = watch(resolved, { recursive: process.platform === 'win32' }, () => scheduleWatchedScan(resolved));
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 720,
    backgroundColor: '#f6f7f2', titleBarStyle: 'hidden', titleBarOverlay: { color: '#111712', symbolColor: '#dfe9df', height: 42 },
    webPreferences: { preload: path.join(currentDir, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true },
  });
  mainWindow = window;
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const audit = process.env.PLUMBUDDY_CLICK_AUDIT === '1';
  if (devUrl) await window.loadURL(`${devUrl}${audit ? '?audit=1' : ''}`);
  else await window.loadFile(path.join(currentDir, '../../dist/index.html'), audit ? { query: { audit: '1' } } : undefined);
  window.webContents.setZoomFactor(1.1);
}

app.whenReady().then(async () => {
  initializeDatabase();
  configureBrowserSession();
  if (process.env.PLUMBUDDY_CLICK_AUDIT === '1') {
    await writeFile(path.join(app.getPath('userData'), 'click-audit.jsonl'), '', 'utf8');
  }
  defaults = { onboardingComplete: false, displayName: process.env.USERNAME || 'Player', ...(await detectDefaultPaths()), automaticOrganization: true,
    highConfidenceAutoCategorization: false, backupBeforeSwitching: true, keepArchives: false,
    checkForUpdates: true, launchAfterSwitch: false, theme: 'system', accentTheme: 'lime',
    accentColor: '#84d651', accentX: 10, accentY: 24, uiColor: '#1d231f', uiX: 18, uiY: 34, textScale: 1 };
  lastScan = getLastScan(getSettings(defaults).modsFolder);

  ipcMain.handle('settings:get', () => getSettings(defaults));
  ipcMain.handle('settings:save', (_event, update: Partial<AppSettings>) => saveSettings(defaults, update));
  ipcMain.handle('paths:detect', detectDefaultPaths);
  ipcMain.handle('folder:choose', async (_event, title: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({ title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('pack-file:choose', async (_event, title: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title, defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'Plumbuddy pack files', extensions: ['json'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('zip-file:choose', async (_event, title: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title, defaultPath,
      properties: ['openFile'],
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('zip-files:choose', async (_event, title: string, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      title, defaultPath,
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'ZIP archives', extensions: ['zip'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('folder:open', async (_event, folderPath: string) => (await shell.openPath(path.resolve(folderPath))) === '');
  ipcMain.handle('external:open', async (_event, rawUrl: string) => {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new Error('Only secure HTTPS links can be opened');
    await shell.openExternal(url.toString());
    return true;
  });
  ipcMain.handle('app:check-updates', () => checkAppUpdates());
  ipcMain.handle('audit:click', async (_event, entry: { label: string; page: string; planned: boolean; tag: string }) => {
    await appendFile(path.join(app.getPath('userData'), 'click-audit.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
  });
  ipcMain.handle('downloads:start', (_event, id: string, url: string, downloadsFolder: string, installFolder: string, options?: DownloadOptions) =>
    downloadFromUrl(id, url, downloadsFolder, installFolder, options));
  ipcMain.handle('bulk:prepare-zip', (_event, url: string, downloadsFolder: string) => prepareBulkZip(url, downloadsFolder));
  ipcMain.handle('bulk:prepare-zip-file', (_event, filePath: string) => prepareBulkZipFile(filePath));
  ipcMain.handle('bulk:prepare-zip-files', (_event, filePaths: string[]) => prepareBulkZipFiles(filePaths));
  ipcMain.handle('bulk:install-zip', (_event, planId: string, choices: Parameters<typeof installBulkZip>[1], modsFolder: string) => installBulkZip(planId, choices, modsFolder));
  ipcMain.handle('downloads:cancel', (_event, id: string) => cancelDownload(id));
  ipcMain.handle('mods:move', (_event, filePath: string, modsRoot: string, relativeCategory: string) => moveModToCategory(filePath, modsRoot, relativeCategory));
  ipcMain.handle('mods:move-many', (_event, filePaths: string[], modsRoot: string, relativeCategory: string) => moveModsToCategory(filePaths, modsRoot, relativeCategory));
  ipcMain.handle('mods:fix-locations', (_event, requests: ModMoveRequest[], modsRoot: string) => moveModsToLocations(requests, modsRoot));
  ipcMain.handle('mods:delete-duplicates', (_event, filePaths: string[], modsRoot: string) => trashDuplicateFiles(filePaths, modsRoot));
  ipcMain.handle('mods:empty-folders', (_event, modsRoot: string) => findEmptyFolders(modsRoot));
  ipcMain.handle('mods:remove-empty-folders', (_event, folderPaths: string[], modsRoot: string) => removeEmptyFolders(folderPaths, modsRoot));
  ipcMain.handle('mods:watch', (_event, folderPath: string) => startModsWatcher(folderPath));
  ipcMain.handle('mods:last-scan', () => getLastScan(getSettings(defaults).modsFolder));
  ipcMain.handle('activities:list', listActivities);
  ipcMain.handle('activities:add', (_event, activity: Parameters<typeof addActivity>[0]) => addActivity(activity));
  ipcMain.handle('game:launch', async () => {
    const candidates = [
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'EA Games', 'The Sims 4', 'Game', 'Bin', 'TS4_x64.exe'),
      path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam', 'steamapps', 'common', 'The Sims 4', 'Game', 'Bin', 'TS4_x64.exe'),
    ];
    for (const executable of candidates) {
      try { await access(executable); const error = await shell.openPath(executable); return { success: !error, message: error || 'The Sims 4 is launching' }; }
      catch { /* Try the next known installation. */ }
    }
    try { await shell.openExternal('steam://rungameid/1222670'); return { success: true, message: 'Opening The Sims 4 in your game launcher' }; }
    catch { return { success: false, message: 'The Sims 4 installation could not be found' }; }
  });
  ipcMain.handle('mods:scan', async (_event, folderPath: string) => {
    const scan = await runCachedScan(folderPath);
    await refreshActivePackFromScan(folderPath, scan);
    return scan;
  });
  ipcMain.handle('backups:create', async (_event, modsFolder: string, backupFolder: string) => {
    const scan = scanBelongsToFolder(lastScan, modsFolder) ? lastScan! : await runCachedScan(modsFolder);
    const record = await createBackup(modsFolder, backupFolder, scan.files.length); saveBackup(record); return record;
  });
  ipcMain.handle('backups:list', listBackups);
  ipcMain.handle('packs:create', async (_event, name: string, modsFolder: string, packStorage: string) => {
    const scan = scanBelongsToFolder(lastScan, modsFolder) ? lastScan! : await runCachedScan(modsFolder);
    const record = await createModPack(name, modsFolder, packStorage, scan); saveModPack(record); return record;
  });
  ipcMain.handle('packs:update', async (_event, packId: string, modsFolder: string) => {
    const pack = listModPacks().find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    const scan = await runCachedScan(modsFolder);
    const record = await updateModPackManifest(pack, modsFolder, scan);
    saveModPack(record);
    await refreshPackHost(record, modsFolder).catch(() => undefined);
    return record;
  });
  ipcMain.handle('packs:switch', async (_event, packId: string, modsFolder: string, backupFolder: string, backupFirst: boolean, activePackId?: string) => {
    const pack = listModPacks().find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    const activePack = activePackId ? listModPacks().find(item => item.id === activePackId) : undefined;
    const result = await switchModPack(pack, modsFolder, backupFolder, backupFirst, activePack);
    if (result.backup) saveBackup(result.backup);
    for (const updatedPack of result.updatedPacks ?? []) saveModPack(updatedPack);
    void runCachedScan(modsFolder)
      .then(scan => mainWindow?.webContents.send('mods:folder-changed', scan))
      .catch(error => mainWindow?.webContents.send('mods:folder-watch-error', error instanceof Error ? error.message : 'Pack switched, but the Mods folder scan is still needed'));
    return result;
  });
  ipcMain.handle('packs:active-infer', async (_event, modsFolder: string) => {
    const active = await inferActiveModPack(listModPacks(), modsFolder);
    if (active) saveModPack(active);
    return active;
  });
  ipcMain.handle('packs:compare', async (_event, filePath: string, modsFolder: string) => {
    const scan = await runCachedScan(modsFolder);
    return compareModPackManifest(filePath, scan);
  });
  ipcMain.handle('packs:host-start', async (_event, packId: string, modsFolder: string, options?: { collaboration?: boolean; hostName?: string }) => {
    const pack = listModPacks().find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    return startPackHost(pack, modsFolder, options);
  });
  ipcMain.handle('packs:host-stop', (_event, packId: string) => stopPackHost(packId));
  ipcMain.handle('packs:host-discover', () => discoverHostedPacks());
  ipcMain.handle('packs:host-transfers', () => listHostTransfers());
  ipcMain.handle('packs:host-connect', async (_event, url: string, modsFolder: string) => {
    const scan = await runCachedScan(modsFolder);
    return connectHostedPack(url, scan);
  });
  ipcMain.handle('packs:host-install', async (event, url: string, downloadsFolder: string, modsFolder: string, packStorage: string) => {
    try {
      const result = await installHostedPack(url, downloadsFolder, modsFolder, packStorage, progress => {
        event.sender.send('packs:host-install-progress', progress);
      });
      if (result.installedPack) saveModPack(result.installedPack);
      return result;
    } catch (error) {
      event.sender.send('packs:host-install-progress', { phase: 'failed', message: error instanceof Error ? error.message : 'Hosted pack transfer failed' });
      throw error;
    }
  });
  ipcMain.handle('packs:collab-sync', async (event, urls: string[], modsFolder: string) => {
    try {
      const scan = await runCachedScan(modsFolder);
      const result = await syncCollabPacks(urls, modsFolder, scan, progress => {
        event.sender.send('packs:host-install-progress', progress);
      });
      void runCachedScan(modsFolder)
        .then(scan => mainWindow?.webContents.send('mods:folder-changed', scan))
        .catch(() => undefined);
      return result;
    } catch (error) {
      event.sender.send('packs:host-install-progress', { phase: 'failed', message: error instanceof Error ? error.message : 'Collab sync failed' });
      throw error;
    }
  });
  ipcMain.handle('packs:collab-cancel', () => cancelCollabSync());
  ipcMain.handle('packs:sync-folder-layout', async (_event, urls: string[], modsFolder: string) => {
    const manifests = await Promise.all([...new Set(urls)].map(url => fetchHostedManifest(url)));
    const scan = await runCachedScan(modsFolder);
    const result = await syncFolderLayoutFromManifests(manifests, scan, modsFolder);
    void runCachedScan(modsFolder)
      .then(scan => mainWindow?.webContents.send('mods:folder-changed', scan))
      .catch(() => undefined);
    return result;
  });
  ipcMain.handle('packs:delete', async (_event, packId: string) => {
    const settings = getSettings(defaults);
    if (settings.activePackId === packId) throw new Error('Activate another pack before deleting this active pack.');
    const pack = listModPacks().find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    await stopPackHost(packId);
    const packFolder = path.dirname(pack.manifestPath);
    deleteModPackRecord(packId);
    if (packFolder && path.basename(packFolder).toLowerCase() !== 'mod packs') {
      const resolved = path.resolve(packFolder);
      const simsRoot = path.resolve(path.dirname(settings.modsFolder));
      const packStorageRoot = path.resolve(settings.packStorage);
      const safeToRemove = resolved.startsWith(`${simsRoot}${path.sep}`) || resolved.startsWith(`${packStorageRoot}${path.sep}`);
      if (safeToRemove) await shell.trashItem(resolved).catch(() => rm(resolved, { recursive: true, force: true }));
    }
    return true;
  });
  ipcMain.handle('packs:list', listModPacks);
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
