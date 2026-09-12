export type Category =
  | 'Gameplay'
  | 'CAS'
  | 'Build/Buy'
  | 'Script Mods'
  | 'Overrides'
  | 'Uncategorized';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentTheme = 'lime' | 'sky' | 'violet' | 'lavender' | 'rose' | 'coral' | 'amber' | 'gold' | 'mint' | 'teal' | 'slate' | 'custom';

export interface AppSettings {
  onboardingComplete: boolean;
  displayName: string;
  modsFolder: string;
  packStorage: string;
  backupStorage: string;
  downloadsFolder: string;
  activePackId?: string;
  automaticOrganization: boolean;
  highConfidenceAutoCategorization: boolean;
  backupBeforeSwitching: boolean;
  keepArchives: boolean;
  checkForUpdates: boolean;
  launchAfterSwitch: boolean;
  theme: ThemeMode;
  accentTheme: AccentTheme;
  accentColor: string;
  accentX: number;
  accentY: number;
  uiColor: string;
  uiX: number;
  uiY: number;
  textScale: number;
}

export interface ModFile {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  size: number;
  modifiedAt: string;
  hash: string;
  category: Category;
  recommendedLocation: string | null;
  categoryMismatch: boolean;
  enabled: boolean;
  duplicate: boolean;
  depthIssue: boolean;
}

export interface ScanResult {
  files: ModFile[];
  totalSize: number;
  duplicateGroups: number;
  depthIssues: number;
  uncategorized: number;
  scannedAt: string;
}

export interface BackupRecord {
  id: string;
  filePath: string;
  name: string;
  createdAt: string;
  size: number;
  modCount: number;
}

export interface ModPackRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  shareCode: string;
  fileCount: number;
  totalSize: number;
  manifestPath: string;
  sharePath?: string;
}

export interface ModPackManifestFile {
  path: string;
  name: string;
  size: number;
  sha256: string;
  category: Category;
}

export interface ModPackManifest {
  schemaVersion: number;
  id: string;
  name: string;
  shareCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sourceFolder: string;
  collaboration?: boolean;
  collaborators?: string[];
  files: ModPackManifestFile[];
}

export interface PackComparisonResult {
  manifest: Pick<ModPackManifest, 'id' | 'name' | 'shareCode' | 'version' | 'updatedAt'>;
  added: ModPackManifestFile[];
  updated: Array<{ expected: ModPackManifestFile; local: ModFile }>;
  missing: ModPackManifestFile[];
  matching: number;
  hostUrl?: string;
}

export interface HostedPackSession {
  packId: string;
  name: string;
  version: number;
  shareCode: string;
  url: string;
  localUrl: string;
  fileCount: number;
  hostName?: string;
  collaboration?: boolean;
}

export interface DiscoveredHostedPack {
  name: string;
  version: number;
  shareCode: string;
  url: string;
  fileCount: number;
  host: string;
  hostName?: string;
  collaboration?: boolean;
  seenAt: string;
}

export interface HostTransferStatus {
  id: string;
  packId: string;
  packName: string;
  client: string;
  status: 'downloading' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  message?: string;
}

export interface HostedPackInstallResult {
  packName: string;
  version: number;
  installedFiles: number;
  archiveDeleted: boolean;
  installFolder?: string;
  installedPack?: ModPackRecord;
}

export interface CollabSyncResult {
  packName: string;
  peerCount: number;
  syncedFiles: number;
  skippedFiles: number;
  movedFiles?: number;
}

export interface FolderLayoutSyncResult {
  moved: number;
  alreadyCorrect: number;
  unmatched: number;
  errors: Array<{ filePath: string; message: string }>;
}

export interface PackSwitchResult {
  packName: string;
  activatedFiles: number;
  backup?: BackupRecord;
  updatedPacks?: ModPackRecord[];
}

export interface HostedPackInstallProgress {
  phase: 'preparing' | 'downloading' | 'writing' | 'saved' | 'complete' | 'failed';
  file?: string;
  index?: number;
  total?: number;
  bytes?: number;
  message: string;
}

export interface BrowserDownloadRequest {
  url: string;
  filename: string;
  mimeType: string;
}

export type DownloadState = 'downloading' | 'installed' | 'downloaded' | 'failed' | 'cancelled';

export interface DownloadRecord {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  installPath: string;
  state: DownloadState;
  createdAt: string;
  filePath?: string;
  size?: number;
  extractedFiles?: number;
  archiveDeleted?: boolean;
  replaceExisting?: boolean;
  error?: string;
}

export interface DownloadResult {
  filePath: string;
  name: string;
  size: number;
  state: 'installed' | 'downloaded';
  extractedFiles?: number;
  archiveDeleted?: boolean;
}

export interface BulkZipEntry {
  id: string;
  archivePath: string;
  rootArchivePath?: string;
  sourceArchivePath?: string;
  name: string;
  size: number;
  recommendedLocation: string | null;
  selectedLocation: string;
  needsReview: boolean;
}

export interface BulkZipPlan {
  id: string;
  archivePath: string;
  archiveName: string;
  archives?: Array<{ path: string; name: string }>;
  entries: BulkZipEntry[];
  skippedFiles: number;
}

export interface BulkInstallChoice {
  id: string;
  selectedLocation: string;
  skip?: boolean;
}

export interface BulkInstallResult {
  installedFiles: number;
  skippedFiles: number;
  archiveDeleted: boolean;
}

export interface DownloadOptions {
  replaceExisting?: boolean;
}

export interface BulkMoveResult {
  moved: Array<{ oldPath: string; newPath: string }>;
  errors: Array<{ filePath: string; message: string }>;
}

export interface DuplicateDeleteResult {
  deleted: string[];
  errors: Array<{ filePath: string; message: string }>;
}

export interface EmptyFolderCleanupResult {
  removed: string[];
  errors: Array<{ folderPath: string; message: string }>;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  downloadUrl: string | null;
  assetName: string | null;
  publishedAt: string | null;
}

export interface ModMoveRequest {
  filePath: string;
  relativeCategory: string;
}

export type ActivityType = 'scan' | 'download' | 'backup' | 'pack' | 'organize' | 'settings';

export interface ActivityRecord {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  createdAt: string;
}

export interface ModManagerAPI {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>;
  detectPaths(): Promise<Pick<AppSettings, 'modsFolder' | 'packStorage' | 'backupStorage' | 'downloadsFolder'>>;
  chooseFolder(title: string, defaultPath?: string): Promise<string | null>;
  choosePackFile(title: string, defaultPath?: string): Promise<string | null>;
  chooseZipFile(title: string, defaultPath?: string): Promise<string | null>;
  chooseZipFiles(title: string, defaultPath?: string): Promise<string[]>;
  openFolder(path: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  checkAppUpdates(): Promise<AppUpdateInfo>;
  launchSims(): Promise<{ success: boolean; message: string }>;
  auditClick(entry: { label: string; page: string; planned: boolean; tag: string }): Promise<void>;
  onBrowserDownloadRequest(callback: (request: BrowserDownloadRequest) => void): () => void;
  onBrowserOpenTab(callback: (url: string) => void): () => void;
  onHostedPackInstallProgress(callback: (progress: HostedPackInstallProgress) => void): () => void;
  downloadFromUrl(id: string, url: string, downloadsFolder: string, installFolder: string, options?: DownloadOptions): Promise<DownloadResult>;
  prepareBulkZip(url: string, downloadsFolder: string): Promise<BulkZipPlan>;
  prepareBulkZipFile(filePath: string): Promise<BulkZipPlan>;
  prepareBulkZipFiles(filePaths: string[]): Promise<BulkZipPlan>;
  installBulkZip(planId: string, choices: BulkInstallChoice[], modsFolder: string): Promise<BulkInstallResult>;
  cancelDownload(id: string): Promise<void>;
  moveMod(filePath: string, modsRoot: string, relativeCategory: string): Promise<{ newPath: string }>;
  moveMods(filePaths: string[], modsRoot: string, relativeCategory: string): Promise<BulkMoveResult>;
  fixModLocations(items: ModMoveRequest[], modsRoot: string): Promise<BulkMoveResult>;
  deleteDuplicates(filePaths: string[], modsRoot: string): Promise<DuplicateDeleteResult>;
  findEmptyFolders(modsRoot: string): Promise<string[]>;
  removeEmptyFolders(folderPaths: string[], modsRoot: string): Promise<EmptyFolderCleanupResult>;
  listActivities(): Promise<ActivityRecord[]>;
  addActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>): Promise<ActivityRecord>;
  scanMods(path: string): Promise<ScanResult>;
  watchModsFolder(path: string): Promise<void>;
  onModsFolderChanged(callback: (scan: ScanResult) => void): () => void;
  getLastScan(): Promise<ScanResult | null>;
  createBackup(modsFolder: string, backupFolder: string): Promise<BackupRecord>;
  listBackups(): Promise<BackupRecord[]>;
  createModPack(name: string, modsFolder: string, packStorage: string): Promise<ModPackRecord>;
  updateModPack(packId: string, modsFolder: string): Promise<ModPackRecord>;
  switchModPack(packId: string, modsFolder: string, backupFolder: string, backupFirst: boolean, activePackId?: string): Promise<PackSwitchResult>;
  inferActiveModPack(modsFolder: string): Promise<ModPackRecord | null>;
  compareModPack(filePath: string, modsFolder: string): Promise<PackComparisonResult>;
  startPackHost(packId: string, modsFolder: string, options?: { collaboration?: boolean; hostName?: string }): Promise<HostedPackSession>;
  stopPackHost(packId: string): Promise<void>;
  discoverHostedPacks(): Promise<DiscoveredHostedPack[]>;
  listHostTransfers(): Promise<HostTransferStatus[]>;
  connectHostedPack(url: string, modsFolder: string): Promise<PackComparisonResult>;
  installHostedPack(url: string, downloadsFolder: string, modsFolder: string, packStorage: string): Promise<HostedPackInstallResult>;
  syncCollabPacks(urls: string[], modsFolder: string): Promise<CollabSyncResult>;
  cancelCollabSync(): Promise<boolean>;
  syncFolderLayout(urls: string[], modsFolder: string): Promise<FolderLayoutSyncResult>;
  deleteModPack(packId: string): Promise<boolean>;
  listModPacks(): Promise<ModPackRecord[]>;
}

declare global {
  interface Window {
    modManager?: ModManagerAPI;
  }
}
