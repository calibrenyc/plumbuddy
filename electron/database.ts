import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ActivityRecord, AppSettings, BackupRecord, ModFile, ModPackRecord, ScanResult } from '../src/types.js';

let db: DatabaseSync;

export function initializeDatabase() {
  db = new DatabaseSync(path.join(app.getPath('userData'), 'plumbuddy.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mod_files (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, relative_path TEXT NOT NULL,
      extension TEXT NOT NULL, size INTEGER NOT NULL, modified_at TEXT NOT NULL, hash TEXT NOT NULL,
      category TEXT NOT NULL, enabled INTEGER NOT NULL, duplicate INTEGER NOT NULL, depth_issue INTEGER NOT NULL,
      recommended_location TEXT, category_mismatch INTEGER NOT NULL DEFAULT 0,
      scan_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mod_files_hash ON mod_files(hash);
    CREATE TABLE IF NOT EXISTS scan_state (
      id INTEGER PRIMARY KEY CHECK (id = 1), folder_path TEXT NOT NULL, scanned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY, file_path TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL,
      size INTEGER NOT NULL, mod_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mod_packs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, file_count INTEGER NOT NULL,
      total_size INTEGER NOT NULL, manifest_path TEXT NOT NULL, updated_at TEXT, version INTEGER NOT NULL DEFAULT 1,
      share_code TEXT, share_path TEXT
    );
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const columns = new Set((db.prepare('PRAGMA table_info(mod_files)').all() as { name: string }[]).map(column => column.name));
  if (!columns.has('recommended_location')) db.exec('ALTER TABLE mod_files ADD COLUMN recommended_location TEXT');
  if (!columns.has('category_mismatch')) db.exec('ALTER TABLE mod_files ADD COLUMN category_mismatch INTEGER NOT NULL DEFAULT 0');
  const packColumns = new Set((db.prepare('PRAGMA table_info(mod_packs)').all() as { name: string }[]).map(column => column.name));
  if (!packColumns.has('updated_at')) db.exec('ALTER TABLE mod_packs ADD COLUMN updated_at TEXT');
  if (!packColumns.has('version')) db.exec('ALTER TABLE mod_packs ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  if (!packColumns.has('share_code')) db.exec('ALTER TABLE mod_packs ADD COLUMN share_code TEXT');
  if (!packColumns.has('share_path')) db.exec('ALTER TABLE mod_packs ADD COLUMN share_path TEXT');
}

export function getSettings(defaults: AppSettings): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map(row => [row.key, JSON.parse(row.value)]));
  return { ...defaults, ...stored };
}

export function saveSettings(defaults: AppSettings, update: Partial<AppSettings>) {
  const statement = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const remove = db.prepare('DELETE FROM settings WHERE key = ?');
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) remove.run(key);
    else statement.run(key, JSON.stringify(value));
  }
  return getSettings(defaults);
}

export function saveScan(result: ScanResult, folderPath: string) {
  const scanId = result.scannedAt;
  const insert = db.prepare(`INSERT INTO mod_files
    (id,name,path,relative_path,extension,size,modified_at,hash,category,enabled,duplicate,depth_issue,recommended_location,category_mismatch,scan_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM mod_files');
    for (const file of result.files) {
      insert.run(file.id, file.name, file.path, file.relativePath, file.extension, file.size,
        file.modifiedAt, file.hash, file.category, Number(file.enabled), Number(file.duplicate),
        Number(file.depthIssue), file.recommendedLocation, Number(file.categoryMismatch), scanId);
    }
    db.prepare('INSERT OR REPLACE INTO scan_state (id, folder_path, scanned_at) VALUES (1, ?, ?)').run(path.resolve(folderPath), scanId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getLastScan(folderPath?: string): ScanResult | null {
  const state = db.prepare('SELECT folder_path, scanned_at FROM scan_state WHERE id = 1').get() as { folder_path: string; scanned_at: string } | undefined;
  if (state && folderPath && path.resolve(state.folder_path).toLowerCase() !== path.resolve(folderPath).toLowerCase()) return null;
  const rows = db.prepare('SELECT * FROM mod_files ORDER BY relative_path').all() as Record<string, unknown>[];
  if (!state && !rows.length) return null;
  if (!state && folderPath && rows.length && !String(rows[0].path).toLowerCase().startsWith(`${path.resolve(folderPath).toLowerCase()}${path.sep}`)) return null;
  const files: ModFile[] = rows.map(row => ({
    id: row.id as string, name: row.name as string, path: row.path as string, relativePath: row.relative_path as string,
    extension: row.extension as string, size: Number(row.size), modifiedAt: row.modified_at as string,
    hash: row.hash as string, category: row.category as ModFile['category'], enabled: Boolean(row.enabled),
    recommendedLocation: row.recommended_location as string | null,
    categoryMismatch: Boolean(row.category_mismatch),
    duplicate: Boolean(row.duplicate), depthIssue: Boolean(row.depth_issue),
  }));
  return {
    files, totalSize: files.reduce((sum, file) => sum + file.size, 0),
    duplicateGroups: new Set(files.filter(file => file.duplicate).map(file => file.hash)).size,
    depthIssues: files.filter(file => file.depthIssue).length,
    uncategorized: files.filter(file => file.category === 'Uncategorized').length,
    scannedAt: state?.scanned_at ?? rows[0].scan_id as string,
  };
}

export function saveBackup(record: BackupRecord) {
  db.prepare('INSERT INTO backups VALUES (?, ?, ?, ?, ?, ?)').run(
    record.id, record.filePath, record.name, record.createdAt, record.size, record.modCount);
}

export function listBackups(): BackupRecord[] {
  return (db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(row => ({
    id: row.id as string, filePath: row.file_path as string, name: row.name as string,
    createdAt: row.created_at as string, size: Number(row.size), modCount: Number(row.mod_count),
  }));
}

export function saveModPack(record: ModPackRecord) {
  db.prepare(`INSERT OR REPLACE INTO mod_packs
    (id,name,created_at,file_count,total_size,manifest_path,updated_at,version,share_code,share_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    record.id, record.name, record.createdAt, record.fileCount, record.totalSize, record.manifestPath,
    record.updatedAt, record.version, record.shareCode, record.sharePath ?? null);
}

export function listModPacks(): ModPackRecord[] {
  return (db.prepare('SELECT * FROM mod_packs ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(row => ({
    id: row.id as string, name: row.name as string, createdAt: row.created_at as string,
    updatedAt: (row.updated_at as string | null) ?? row.created_at as string,
    version: Number(row.version ?? 1),
    shareCode: (row.share_code as string | null) ?? 'LOCAL',
    fileCount: Number(row.file_count), totalSize: Number(row.total_size), manifestPath: row.manifest_path as string,
    sharePath: row.share_path as string | undefined,
  }));
}

export function deleteModPackRecord(packId: string) {
  db.prepare('DELETE FROM mod_packs WHERE id = ?').run(packId);
}

export function addActivity(activity: Omit<ActivityRecord, 'id' | 'createdAt'>): ActivityRecord {
  const record: ActivityRecord = { ...activity, id: randomUUID(), createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO activities VALUES (?, ?, ?, ?, ?)').run(record.id, record.type, record.title, record.detail, record.createdAt);
  return record;
}

export function listActivities(): ActivityRecord[] {
  return (db.prepare('SELECT * FROM activities ORDER BY created_at DESC LIMIT 100').all() as Record<string, unknown>[]).map(row => ({
    id: row.id as string, type: row.type as ActivityRecord['type'], title: row.title as string,
    detail: row.detail as string, createdAt: row.created_at as string,
  }));
}
