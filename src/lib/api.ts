import type { AppSettings, BackupRecord, ModFile, ModManagerAPI, ModPackRecord, ScanResult } from '../types';

const user = 'Rudy';
const defaults: AppSettings = {
  onboardingComplete: false,
  displayName: user,
  modsFolder: `C:\\Users\\${user}\\Documents\\Electronic Arts\\The Sims 4\\Mods`,
  packStorage: `D:\\Sims Mod Packs`,
  backupStorage: `D:\\Sims Backups`,
  downloadsFolder: `C:\\Users\\${user}\\Downloads\\Plumbuddy`,
  appInstallFolder: `C:\\Users\\${user}\\Documents\\Plumbuddy\\Application`,
  automaticOrganization: true,
  highConfidenceAutoCategorization: false,
  ignoredUncategorizedLocations: [],
  backupBeforeSwitching: true,
  keepArchives: false,
  checkForUpdates: true,
  launchAfterSwitch: false,
  theme: 'system',
  accentTheme: 'lime',
  accentColor: '#84d651',
  accentX: 10,
  accentY: 24,
  uiColor: '#1d231f',
  uiX: 18,
  uiY: 34,
  textScale: 1,
};

const demoMods: ModFile[] = [
  ['WonderfulWhims.ts4script', 'Gameplay\\WonderfulWhims\\WonderfulWhims.ts4script', 'Script Mods', 13_200_000, false, false],
  ['BetterBuildBuy.package', 'BuildBuy\\BetterBuildBuy.package', 'Build/Buy', 8_700_000, false, false],
  ['Sentate_FlorenceDress.package', 'CAS\\Clothes\\Dresses\\Sentate_FlorenceDress.package', 'CAS', 19_100_000, false, false],
  ['Harrie_KitchenSet.package', 'BuildBuy\\Kitchen\\Harrie_KitchenSet.package', 'Build/Buy', 28_400_000, false, false],
  ['NorthernSiberiaWinds_Skin.package', 'CAS\\Genetics\\NorthernSiberiaWinds_Skin.package', 'CAS', 24_800_000, false, false],
  ['MCCC.ts4script', 'Gameplay\\MCCC\\MCCC.ts4script', 'Script Mods', 4_200_000, false, false],
  ['cas-lighting.package', 'Overrides\\cas-lighting.package', 'Overrides', 2_100_000, false, false],
  ['loose-package.package', 'loose-package.package', 'Uncategorized', 5_100_000, false, false],
].map(([name, relativePath, category, size, duplicate, depthIssue], index) => ({
  id: `demo-${index}`, name: name as string, path: `${defaults.modsFolder}\\${relativePath}`,
  relativePath: relativePath as string, extension: (name as string).endsWith('.ts4script') ? '.ts4script' : '.package',
  size: size as number, modifiedAt: new Date(Date.now() - index * 3_600_000).toISOString(), hash: `sha256-demo-${index}`,
  category: category as ModFile['category'], enabled: true, duplicate: duplicate as boolean, depthIssue: depthIssue as boolean,
  recommendedLocation: null, categoryMismatch: false,
}));

function getStoredSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('plumbuddy.settings') ?? '{}') } as AppSettings; }
  catch { return defaults; }
}

const webApi: ModManagerAPI = {
  async getSettings() { return getStoredSettings(); },
  async saveSettings(update) {
    const next = { ...getStoredSettings(), ...update };
    localStorage.setItem('plumbuddy.settings', JSON.stringify(next)); return next;
  },
  async detectPaths() {
    const { modsFolder, packStorage, backupStorage, downloadsFolder, appInstallFolder } = defaults;
    return { modsFolder, packStorage, backupStorage, downloadsFolder, appInstallFolder };
  },
  async chooseFolder(_title, defaultPath) { return defaultPath ?? defaults.modsFolder; },
  async choosePackFile(_title, defaultPath) { return defaultPath ?? `${getStoredSettings().packStorage}\\Rudy-and-Whitney_RW-MP-7HX92_v2.plumbuddy-pack.json`; },
  async chooseZipFile(_title, defaultPath) { return defaultPath ?? `${getStoredSettings().downloadsFolder}\\bulk-mods.zip`; },
  async chooseZipFiles(_title, defaultPath) { return [defaultPath ?? `${getStoredSettings().downloadsFolder}\\bulk-mods.zip`]; },
  async openFolder() { return true; },
  async openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); return true; },
  async showBrowserView() { return false; },
  async setBrowserViewBounds() { return false; },
  async hideBrowserView() { return true; },
  async navigateBrowserView() { return false; },
  async commandBrowserView() { return false; },
  async checkAppUpdates() {
    return {
      currentVersion: '0.1.0',
      latestVersion: '0.1.0',
      updateAvailable: false,
      releaseName: 'v0.1.0',
      releaseNotes: '',
      releaseUrl: 'https://github.com/calibrenyc/plumbuddy/releases/latest',
      downloadUrl: null,
      assetName: null,
      publishedAt: null,
    };
  },
  async listAppReleases() { return []; },
  async downloadAndInstallAppUpdate(update, _installFolder) {
    return { stagedPath: update.downloadUrl ?? '', message: 'Demo update downloaded. Restart the desktop app to apply it.' };
  },
  async launchSims() { return { success: true, message: 'The Sims 4 launch requested' }; },
  async auditClick(entry) {
    const events = JSON.parse(localStorage.getItem('plumbuddy.clickAudit') ?? '[]');
    localStorage.setItem('plumbuddy.clickAudit', JSON.stringify([...events, { at: new Date().toISOString(), ...entry }]));
  },
  onBrowserDownloadRequest() { return () => undefined; },
  onBrowserOpenTab() { return () => undefined; },
  onBrowserViewState() { return () => undefined; },
  onHostedPackInstallProgress() { return () => undefined; },
  async downloadFromUrl(_id, url, downloadsFolder, installFolder, _options) {
    await new Promise(resolve => setTimeout(resolve, 900));
    const rawName = new URL(url).pathname.split('/').filter(Boolean).pop() || 'download.package';
    const name = /\.(package|ts4script|cfg)$/i.test(rawName) ? rawName : `${rawName.replace(/\.[^.]+$/, '') || 'download'}.zip`;
    const direct = /\.(package|ts4script|cfg)$/i.test(name);
    return { filePath: `${direct ? installFolder : downloadsFolder}\\${name}`, name, size: 0, state: direct ? 'installed' : 'downloaded' };
  },
  async prepareBulkZip(url) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return {
      id: crypto.randomUUID(),
      archivePath: url,
      archiveName: 'bulk-mods.zip',
      skippedFiles: 0,
      entries: demoMods.slice(0, 4).map(file => ({
        id: crypto.randomUUID(),
        archivePath: file.relativePath,
        name: file.name,
        size: file.size,
        recommendedLocation: file.recommendedLocation,
        selectedLocation: file.recommendedLocation ?? 'Uncategorized',
        needsReview: !file.recommendedLocation,
      })),
    };
  },
  async prepareBulkZipFile(filePath) { return webApi.prepareBulkZip(filePath, getStoredSettings().downloadsFolder); },
  async prepareBulkZipFiles(filePaths) {
    const plan = await webApi.prepareBulkZip(filePaths[0] ?? 'bulk-mods.zip', getStoredSettings().downloadsFolder);
    return { ...plan, archiveName: `${filePaths.length} ZIP bundle${filePaths.length === 1 ? '' : 's'}` };
  },
  async installBulkZip(_planId, choices) {
    await new Promise(resolve => setTimeout(resolve, 700));
    return { installedFiles: choices.filter(choice => !choice.skip).length, skippedFiles: choices.filter(choice => choice.skip).length, archiveDeleted: true };
  },
  async cancelDownload() {},
  async moveMod() {
    throw new Error('Moving files is only available in the Plumbuddy desktop app. Open the desktop window and try again.');
  },
  async moveMods() {
    throw new Error('Moving files is only available in the Plumbuddy desktop app. Open the desktop window and try again.');
  },
  async fixModLocations() {
    throw new Error('Moving files is only available in the Plumbuddy desktop app. Open the desktop window and try again.');
  },
  async deleteDuplicates() {
    throw new Error('Duplicate cleanup is only available in the Plumbuddy desktop app. Open the desktop window and try again.');
  },
  async findEmptyFolders() {
    return [];
  },
  async removeEmptyFolders() {
    return { removed: [], errors: [] };
  },
  async listActivities() {
    return JSON.parse(localStorage.getItem('plumbuddy.activities') ?? '[]');
  },
  async addActivity(activity) {
    const record = { ...activity, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    const activities = JSON.parse(localStorage.getItem('plumbuddy.activities') ?? '[]');
    localStorage.setItem('plumbuddy.activities', JSON.stringify([record, ...activities].slice(0, 100)));
    return record;
  },
  async scanMods() {
    await new Promise(resolve => setTimeout(resolve, 900));
    return { files: demoMods, totalSize: 105_600_000, duplicateGroups: 0, depthIssues: 0, uncategorized: 1, scannedAt: new Date().toISOString() };
  },
  async watchModsFolder() {},
  onModsFolderChanged() { return () => undefined; },
  async getLastScan() { return demoScan; },
  async createBackup() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const record: BackupRecord = { id: crypto.randomUUID(), filePath: `${getStoredSettings().backupStorage}\\SimsModsBackup_20260906_1130.zip`, name: 'SimsModsBackup_20260906_1130.zip', createdAt: new Date().toISOString(), size: 96_400_000, modCount: 124 };
    localStorage.setItem('plumbuddy.backups', JSON.stringify([record, ...JSON.parse(localStorage.getItem('plumbuddy.backups') ?? '[]')]));
    return record;
  },
  async listBackups() { return JSON.parse(localStorage.getItem('plumbuddy.backups') ?? '[]'); },
  async createModPack(name) {
    await new Promise(resolve => setTimeout(resolve, 700));
    const createdAt = new Date().toISOString();
    const record: ModPackRecord = { id: crypto.randomUUID(), name, createdAt, updatedAt: createdAt, version: 1, shareCode: 'RW-MP-7HX92', fileCount: 124, totalSize: 3_700_000_000, manifestPath: `${getStoredSettings().packStorage}\\${name}\\plumbuddy.manifest.json`, sharePath: `${getStoredSettings().packStorage}\\${name}\\${name}_RW-MP-7HX92_v1.plumbuddy-pack.json` };
    localStorage.setItem('plumbuddy.packs', JSON.stringify([record, ...JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]')]));
    return record;
  },
  async updateModPack(packId) {
    const packs: ModPackRecord[] = JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]');
    const pack = packs.find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    const updated = { ...pack, updatedAt: new Date().toISOString(), version: pack.version + 1, fileCount: demoMods.length, totalSize: demoScan.totalSize, sharePath: `${getStoredSettings().packStorage}\\${pack.name}\\${pack.name}_${pack.shareCode}_v${pack.version + 1}.plumbuddy-pack.json` };
    localStorage.setItem('plumbuddy.packs', JSON.stringify([updated, ...packs.filter(item => item.id !== packId)]));
    return updated;
  },
  async switchModPack(packId) {
    const packs: ModPackRecord[] = JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]');
    const pack = packs.find(item => item.id === packId);
    if (!pack) throw new Error('That mod pack could not be found');
    return { packName: pack.name, activatedFiles: pack.fileCount };
  },
  async inferActiveModPack() {
    const settings = getStoredSettings();
    const packs: ModPackRecord[] = JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]');
    return packs.find(pack => pack.id === settings.activePackId) ?? null;
  },
  async compareModPack() {
    return {
      manifest: { id: 'demo-pack', name: 'Rudy & Whitney', shareCode: 'RW-MP-7HX92', version: 2, updatedAt: new Date().toISOString() },
      added: demoMods.slice(0, 1).map(file => ({ path: file.relativePath, name: file.name, size: file.size, sha256: file.hash, category: file.category })),
      updated: [{ expected: { path: 'Gameplay\\MCCC.ts4script', name: 'MCCC.ts4script', size: 4_200_000, sha256: 'remote-demo', category: 'Script Mods' as const }, local: demoMods[5] }],
      missing: demoMods.slice(2, 4).map(file => ({ path: file.relativePath, name: file.name, size: file.size, sha256: file.hash, category: file.category })),
      matching: 4,
    };
  },
  async startPackHost(packId) {
    const packs: ModPackRecord[] = JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]');
    const pack = packs.find(item => item.id === packId) ?? packs[0];
    if (!pack) throw new Error('Create a mod pack before hosting');
    return {
      packId: pack.id,
      name: pack.name,
      version: pack.version,
      shareCode: pack.shareCode,
      url: `http://192.168.1.25:31845/pack/DEMO1234ABCD`,
      localUrl: `http://127.0.0.1:31845/pack/DEMO1234ABCD`,
      fileCount: pack.fileCount,
    };
  },
  async stopPackHost() {},
  async discoverHostedPacks() { return []; },
  async listHostTransfers() { return []; },
  async connectHostedPack(url) {
    return { ...(await webApi.compareModPack('', '')), hostUrl: url };
  },
  async installHostedPack(_url, _downloadsFolder, _modsFolder, packStorage) {
    await new Promise(resolve => setTimeout(resolve, 900));
    return { packName: 'Rudy & Whitney', version: 2, installedFiles: 8, archiveDeleted: true, installFolder: `${packStorage}\\Rudy & Whitney_RW-MP-7HX92_v2\\Mods` };
  },
  async syncCollabPacks() {
    await new Promise(resolve => setTimeout(resolve, 900));
    return { packName: 'Rudy & Whitney', peerCount: 2, syncedFiles: 4, skippedFiles: 6 };
  },
  async cancelCollabSync() { return true; },
  async syncFolderLayout() {
    await new Promise(resolve => setTimeout(resolve, 600));
    return { moved: 3, alreadyCorrect: 5, unmatched: 1, errors: [] };
  },
  async deleteModPack(packId) {
    const packs: ModPackRecord[] = JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]');
    localStorage.setItem('plumbuddy.packs', JSON.stringify(packs.filter(pack => pack.id !== packId)));
    return true;
  },
  async listModPacks() { return JSON.parse(localStorage.getItem('plumbuddy.packs') ?? '[]'); },
};

export const api = window.modManager ?? webApi;

export const demoScan: ScanResult = {
  files: demoMods,
  totalSize: 3_700_000_000,
  duplicateGroups: 0,
  depthIssues: 0,
  uncategorized: 1,
  scannedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};
