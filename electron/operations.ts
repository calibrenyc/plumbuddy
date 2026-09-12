import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { access, copyFile, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BackupRecord, ModPackManifest, ModPackManifestFile, ModPackRecord, PackComparisonResult, PackSwitchResult, ScanResult } from '../src/types.js';
import { ensureDirectory } from './paths.js';

export async function createBackup(modsFolder: string, backupFolder: string, modCount: number): Promise<BackupRecord> {
  const source = path.resolve(modsFolder);
  const destination = path.resolve(backupFolder);
  await ensureDirectory(destination);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 13);
  const name = `SimsModsBackup_${stamp}.zip`;
  const filePath = path.join(destination, name);
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(filePath, { flags: 'wx' });
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(source, 'Mods');
    void archive.finalize();
  });
  const info = await stat(filePath);
  return { id: randomUUID(), filePath, name, createdAt: new Date().toISOString(), size: info.size, modCount };
}

function shareCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('').replace(/(.{4})/, '$1-');
}

function manifestFiles(scan: ScanResult): ModPackManifestFile[] {
  return scan.files.map(file => ({
    path: file.relativePath,
    name: file.name,
    size: file.size,
    sha256: file.hash,
    category: file.category,
  }));
}

function sameManifestFiles(left: ModPackManifestFile[], right: ModPackManifestFile[]) {
  if (left.length !== right.length) return false;
  const normalize = (files: ModPackManifestFile[]) => files
    .map(file => `${file.path.toLowerCase()}|${file.name.toLowerCase()}|${file.size}|${file.sha256}|${file.category}`)
    .sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.every((value, index) => value === b[index]);
}

function shareFileName(name: string, code: string, version: number) {
  const safeName = name.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').trim() || 'Mod-Pack';
  return `${safeName}_${code}_v${version}.plumbuddy-pack.json`;
}

async function writeManifestCopies(directory: string, manifest: ModPackManifest) {
  const manifestPath = path.join(directory, 'plumbuddy.manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8' });
  const sharePath = path.join(directory, shareFileName(manifest.name, manifest.shareCode, manifest.version));
  await copyFile(manifestPath, sharePath);
  return { manifestPath, sharePath };
}

function recordFromManifest(manifest: ModPackManifest, manifestPath: string, sharePath?: string): ModPackRecord {
  return {
    id: manifest.id,
    name: manifest.name,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    version: manifest.version,
    shareCode: manifest.shareCode,
    fileCount: manifest.files.length,
    totalSize: manifest.files.reduce((sum, file) => sum + file.size, 0),
    manifestPath,
    sharePath,
  };
}

function safePackFolderName(manifest: Pick<ModPackManifest, 'name' | 'shareCode' | 'id' | 'version'>) {
  const name = manifest.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'Mod Pack';
  return `${name}_${manifest.shareCode ?? manifest.id}_v${manifest.version}`;
}

export async function createModPack(name: string, modsFolder: string, packStorage: string, scan: ScanResult): Promise<ModPackRecord> {
  const safeName = name.replace(/[<>:"/\\|?*]/g, '-').trim() || 'New Mod Pack';
  const id = randomUUID();
  const code = shareCode();
  const directory = path.join(path.resolve(packStorage), safeName);
  await ensureDirectory(directory);
  const createdAt = new Date().toISOString();
  const manifest: ModPackManifest = {
    schemaVersion: 2, id, name: safeName, shareCode: code, version: 1, createdAt, updatedAt: createdAt,
    sourceFolder: path.resolve(modsFolder), files: manifestFiles(scan),
  };
  const { manifestPath, sharePath } = await writeManifestCopies(directory, manifest);
  return recordFromManifest(manifest, manifestPath, sharePath);
}

export async function updateModPackManifest(record: ModPackRecord, modsFolder: string, scan: ScanResult): Promise<ModPackRecord> {
  const existing = JSON.parse(await readFile(record.manifestPath, 'utf8')) as ModPackManifest;
  const nextFiles = manifestFiles(scan);
  const sourceChanged = path.resolve(existing.sourceFolder ?? '').toLowerCase() !== path.resolve(modsFolder).toLowerCase();
  if (!sourceChanged && sameManifestFiles(existing.files ?? [], nextFiles)) return recordFromManifest(existing, record.manifestPath, record.sharePath);
  const updatedAt = new Date().toISOString();
  const manifest: ModPackManifest = {
    ...existing,
    schemaVersion: 2,
    version: Number(existing.version ?? record.version ?? 1) + 1,
    updatedAt,
    sourceFolder: path.resolve(modsFolder),
    files: nextFiles,
  };
  const directory = path.dirname(record.manifestPath);
  const result = await writeManifestCopies(directory, manifest);
  return recordFromManifest(manifest, result.manifestPath, result.sharePath);
}

export function compareManifestData(manifest: ModPackManifest, scan: ScanResult): PackComparisonResult {
  if (!manifest.files || !manifest.id || !manifest.name) throw new Error('This is not a valid Plumbuddy pack file');
  const localByHash = new Map(scan.files.map(file => [file.hash, file]));
  const localByName = new Map(scan.files.map(file => [file.name.toLowerCase(), file]));
  const added: ModPackManifestFile[] = [];
  const missing: ModPackManifestFile[] = [];
  const updated: PackComparisonResult['updated'] = [];
  let matching = 0;

  for (const expected of manifest.files) {
    if (localByHash.has(expected.sha256)) {
      matching += 1;
      continue;
    }
    const sameName = localByName.get(expected.name.toLowerCase());
    if (sameName) updated.push({ expected, local: sameName });
    else missing.push(expected);
  }

  const manifestHashes = new Set(manifest.files.map(file => file.sha256));
  for (const local of scan.files) {
    if (!manifestHashes.has(local.hash) && !manifest.files.some(file => file.name.toLowerCase() === local.name.toLowerCase())) {
      added.push({ path: local.relativePath, name: local.name, size: local.size, sha256: local.hash, category: local.category });
    }
  }

  return {
    manifest: {
      id: manifest.id,
      name: manifest.name,
      shareCode: manifest.shareCode ?? 'LOCAL',
      version: Number(manifest.version ?? 1),
      updatedAt: manifest.updatedAt ?? manifest.createdAt,
    },
    added, updated, missing, matching,
  };
}

export async function compareModPackManifest(filePath: string, scan: ScanResult): Promise<PackComparisonResult> {
  return compareManifestData(JSON.parse(await readFile(filePath, 'utf8')) as ModPackManifest, scan);
}

async function clearDirectoryContents(directory: string) {
  const root = path.resolve(directory);
  if (root.length < 10 || path.parse(root).root === root) throw new Error('Refusing to clear an unsafe Mods folder path');
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  for (const entry of entries) {
    const target = path.join(root, entry);
    const resolved = path.resolve(target);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe file while switching packs: ${entry}`);
    await rm(resolved, { recursive: true, force: true });
  }
}

async function availableDirectoryPath(directory: string) {
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? directory : `${directory} (${index})`;
    try { await access(candidate); }
    catch { return candidate; }
  }
  throw new Error('Could not create a unique folder while switching packs');
}

async function moveFolderSafely(source: string, destination: string) {
  const resolvedSource = path.resolve(source);
  const resolvedDestination = path.resolve(await availableDirectoryPath(destination));
  await mkdir(path.dirname(resolvedDestination), { recursive: true });
  await rename(resolvedSource, resolvedDestination);
  return resolvedDestination;
}

async function manifestExists(filePath: string) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function resolvePackManifest(record: ModPackRecord, modsFolder: string) {
  if (await manifestExists(record.manifestPath)) {
    const manifest = JSON.parse(await readFile(record.manifestPath, 'utf8')) as ModPackManifest;
    const storedMods = await findStoredModsFolder(path.dirname(record.manifestPath));
    if (storedMods && path.resolve(manifest.sourceFolder).toLowerCase() === path.resolve(modsFolder).toLowerCase()) {
      const liveRatio = await manifestLiveMatchRatio(manifest, modsFolder);
      const storedRatio = await manifestLiveMatchRatio(manifest, storedMods);
      if (storedRatio >= 0.95 && storedRatio > liveRatio) {
        const repaired = { ...manifest, sourceFolder: storedMods };
        await writeFile(record.manifestPath, JSON.stringify(repaired, null, 2), 'utf8');
        if (record.sharePath) await writeFile(record.sharePath, JSON.stringify(repaired, null, 2), 'utf8');
        return { record: recordFromManifest(repaired, record.manifestPath, record.sharePath), manifest: repaired };
      }
    }
    return { record, manifest };
  }
  const localPackStorage = path.join(path.dirname(path.resolve(modsFolder)), 'Plumbuddy Mod Packs');
  const candidates: string[] = [];
  try {
    for (const folder of await readdir(localPackStorage, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      candidates.push(path.join(localPackStorage, folder.name, 'plumbuddy.manifest.json'));
    }
  } catch {
    // The new game-adjacent storage folder may not exist yet.
  }
  for (const manifestPath of candidates) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ModPackManifest;
      if (manifest.id !== record.id && manifest.shareCode !== record.shareCode && manifest.name !== record.name) continue;
      const sharePath = path.join(path.dirname(manifestPath), shareFileName(manifest.name, manifest.shareCode, manifest.version));
      return { record: recordFromManifest(manifest, manifestPath, await manifestExists(sharePath) ? sharePath : undefined), manifest };
    } catch {
      // Keep searching other local pack folders.
    }
  }
  throw new Error(`Could not find the local files for "${record.name}". Expected ${record.manifestPath}`);
}

async function findStoredModsFolder(packDirectory: string) {
  try {
    for (const entry of await readdir(packDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.toLowerCase() === 'mods') return path.join(packDirectory, entry.name);
    }
  } catch {
    // Missing pack directory.
  }
  return null;
}

async function updateManifestSource(record: ModPackRecord, sourceFolder: string) {
  const manifest = JSON.parse(await readFile(record.manifestPath, 'utf8')) as ModPackManifest;
  const updated = { ...manifest, sourceFolder: path.resolve(sourceFolder) };
  await writeFile(record.manifestPath, JSON.stringify(updated, null, 2), 'utf8');
  if (record.sharePath) await writeFile(record.sharePath, JSON.stringify(updated, null, 2), 'utf8');
  return recordFromManifest(updated, record.manifestPath, record.sharePath);
}

async function manifestLiveMatchRatio(manifest: ModPackManifest, modsFolder: string) {
  if (!manifest.files.length) return 0;
  let matched = 0;
  for (const file of manifest.files) {
    try {
      const info = await stat(path.join(path.resolve(modsFolder), ...file.path.replace(/\\/g, '/').split('/').filter(Boolean)));
      if (info.isFile() && info.size === file.size) matched += 1;
    } catch {
      // Missing file: not a match.
    }
  }
  return matched / manifest.files.length;
}

export async function switchModPack(record: ModPackRecord, modsFolder: string, backupFolder: string, backupFirst: boolean, activePack?: ModPackRecord): Promise<PackSwitchResult> {
  const resolvedTarget = await resolvePackManifest(record, modsFolder);
  record = resolvedTarget.record;
  const manifest = resolvedTarget.manifest;
  const sourceFolder = path.resolve(manifest.sourceFolder);
  const sourceInfo = await lstat(sourceFolder);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error('This pack does not have a valid local Mods folder to activate');
  const liveMods = path.resolve(modsFolder);
  if (sourceFolder.toLowerCase() === liveMods.toLowerCase()) return { packName: manifest.name, activatedFiles: manifest.files.length, updatedPacks: [record] };
  const gameFolder = path.dirname(liveMods);
  const localPackStorage = path.join(gameFolder, 'Plumbuddy Mod Packs');
  const updatedPacks: ModPackRecord[] = [record];
  await mkdir(localPackStorage, { recursive: true });
  if (activePack && activePack.id !== record.id) {
    const resolvedActive = await resolvePackManifest(activePack, modsFolder);
    const activeManifest = resolvedActive.manifest;
    const activeDestination = path.join(localPackStorage, safePackFolderName(activeManifest), 'Mods');
    const movedTo = await moveFolderSafely(liveMods, activeDestination);
    updatedPacks.push(await updateManifestSource(resolvedActive.record, movedTo));
  } else {
    const looseDestination = path.join(localPackStorage, `_Previous Live Mods ${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await moveFolderSafely(liveMods, looseDestination);
  }
  await moveFolderSafely(sourceFolder, liveMods);
  updatedPacks[0] = await updateManifestSource(record, liveMods);
  return { packName: manifest.name, activatedFiles: manifest.files.length, updatedPacks };
}

export async function inferActiveModPack(records: ModPackRecord[], modsFolder: string): Promise<ModPackRecord | null> {
  const liveMods = path.resolve(modsFolder).toLowerCase();
  let best: { record: ModPackRecord; ratio: number } | null = null;
  for (const record of records) {
    try {
      const resolved = await resolvePackManifest(record, modsFolder);
      const sourceFolder = path.resolve(resolved.manifest.sourceFolder).toLowerCase();
      const ratio = await manifestLiveMatchRatio(resolved.manifest, modsFolder);
      if (sourceFolder === liveMods && ratio >= 0.95) return resolved.record;
      if (ratio > (best?.ratio ?? 0)) best = { record: resolved.record, ratio };
    } catch {
      // Ignore stale/missing packs while looking for the active one.
    }
  }
  if (best && best.ratio >= 0.98) return updateManifestSource(best.record, modsFolder);
  return null;
}
