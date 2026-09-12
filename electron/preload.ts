import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ModManagerAPI } from '../src/types.js';

const api: ModManagerAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings),
  detectPaths: () => ipcRenderer.invoke('paths:detect'),
  chooseFolder: (title, defaultPath) => ipcRenderer.invoke('folder:choose', title, defaultPath),
  choosePackFile: (title, defaultPath) => ipcRenderer.invoke('pack-file:choose', title, defaultPath),
  chooseZipFile: (title, defaultPath) => ipcRenderer.invoke('zip-file:choose', title, defaultPath),
  chooseZipFiles: (title, defaultPath) => ipcRenderer.invoke('zip-files:choose', title, defaultPath),
  openFolder: path => ipcRenderer.invoke('folder:open', path),
  openExternal: url => ipcRenderer.invoke('external:open', url),
  checkAppUpdates: () => ipcRenderer.invoke('app:check-updates'),
  launchSims: () => ipcRenderer.invoke('game:launch'),
  auditClick: entry => ipcRenderer.invoke('audit:click', entry),
  onBrowserDownloadRequest: callback => {
    const handler = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]) => callback(request);
    ipcRenderer.on('browser:download-request', handler);
    return () => ipcRenderer.removeListener('browser:download-request', handler);
  },
  onBrowserOpenTab: callback => {
    const handler = (_event: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('browser:open-tab', handler);
    return () => ipcRenderer.removeListener('browser:open-tab', handler);
  },
  onHostedPackInstallProgress: callback => {
    const handler = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on('packs:host-install-progress', handler);
    return () => ipcRenderer.removeListener('packs:host-install-progress', handler);
  },
  downloadFromUrl: (id, url, downloadsFolder, installFolder, options) => ipcRenderer.invoke('downloads:start', id, url, downloadsFolder, installFolder, options),
  prepareBulkZip: (url, downloadsFolder) => ipcRenderer.invoke('bulk:prepare-zip', url, downloadsFolder),
  prepareBulkZipFile: filePath => ipcRenderer.invoke('bulk:prepare-zip-file', filePath),
  prepareBulkZipFiles: filePaths => ipcRenderer.invoke('bulk:prepare-zip-files', filePaths),
  installBulkZip: (planId, choices, modsFolder) => ipcRenderer.invoke('bulk:install-zip', planId, choices, modsFolder),
  cancelDownload: id => ipcRenderer.invoke('downloads:cancel', id),
  moveMod: (filePath, modsRoot, relativeCategory) => ipcRenderer.invoke('mods:move', filePath, modsRoot, relativeCategory),
  moveMods: (filePaths, modsRoot, relativeCategory) => ipcRenderer.invoke('mods:move-many', filePaths, modsRoot, relativeCategory),
  fixModLocations: (items, modsRoot) => ipcRenderer.invoke('mods:fix-locations', items, modsRoot),
  deleteDuplicates: (filePaths, modsRoot) => ipcRenderer.invoke('mods:delete-duplicates', filePaths, modsRoot),
  findEmptyFolders: modsRoot => ipcRenderer.invoke('mods:empty-folders', modsRoot),
  removeEmptyFolders: (folderPaths, modsRoot) => ipcRenderer.invoke('mods:remove-empty-folders', folderPaths, modsRoot),
  listActivities: () => ipcRenderer.invoke('activities:list'),
  addActivity: activity => ipcRenderer.invoke('activities:add', activity),
  scanMods: path => ipcRenderer.invoke('mods:scan', path),
  watchModsFolder: path => ipcRenderer.invoke('mods:watch', path),
  onModsFolderChanged: callback => {
    const handler = (_event: Electron.IpcRendererEvent, scan: Parameters<typeof callback>[0]) => callback(scan);
    ipcRenderer.on('mods:folder-changed', handler);
    return () => ipcRenderer.removeListener('mods:folder-changed', handler);
  },
  getLastScan: () => ipcRenderer.invoke('mods:last-scan'),
  createBackup: (modsFolder, backupFolder) => ipcRenderer.invoke('backups:create', modsFolder, backupFolder),
  listBackups: () => ipcRenderer.invoke('backups:list'),
  createModPack: (name, modsFolder, packStorage) => ipcRenderer.invoke('packs:create', name, modsFolder, packStorage),
  updateModPack: (packId, modsFolder) => ipcRenderer.invoke('packs:update', packId, modsFolder),
  switchModPack: (packId, modsFolder, backupFolder, backupFirst, activePackId) => ipcRenderer.invoke('packs:switch', packId, modsFolder, backupFolder, backupFirst, activePackId),
  inferActiveModPack: modsFolder => ipcRenderer.invoke('packs:active-infer', modsFolder),
  compareModPack: (filePath, modsFolder) => ipcRenderer.invoke('packs:compare', filePath, modsFolder),
  startPackHost: (packId, modsFolder, options) => ipcRenderer.invoke('packs:host-start', packId, modsFolder, options),
  stopPackHost: packId => ipcRenderer.invoke('packs:host-stop', packId),
  discoverHostedPacks: () => ipcRenderer.invoke('packs:host-discover'),
  listHostTransfers: () => ipcRenderer.invoke('packs:host-transfers'),
  connectHostedPack: (url, modsFolder) => ipcRenderer.invoke('packs:host-connect', url, modsFolder),
  installHostedPack: (url, downloadsFolder, modsFolder, packStorage) => ipcRenderer.invoke('packs:host-install', url, downloadsFolder, modsFolder, packStorage),
  syncCollabPacks: (urls, modsFolder) => ipcRenderer.invoke('packs:collab-sync', urls, modsFolder),
  cancelCollabSync: () => ipcRenderer.invoke('packs:collab-cancel'),
  syncFolderLayout: (urls, modsFolder) => ipcRenderer.invoke('packs:sync-folder-layout', urls, modsFolder),
  deleteModPack: packId => ipcRenderer.invoke('packs:delete', packId),
  listModPacks: () => ipcRenderer.invoke('packs:list'),
};

contextBridge.exposeInMainWorld('modManager', api);
