import { access, lstat, mkdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { BulkMoveResult, FolderLayoutSyncResult, ModMoveRequest, ModPackManifest, ScanResult } from '../src/types.js';

const runFile = promisify(execFile);
const allowedExtensions = new Set(['.package', '.ts4script', '.cfg']);

async function simsIsRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await runFile('tasklist.exe', ['/FI', 'IMAGENAME eq TS4*.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
    return /TS4(?:_DX9)?_x64\.exe/i.test(stdout);
  } catch { return false; }
}

async function safeTargetDirectory(modsRoot: string, relativeCategory: string) {
  if (!relativeCategory || path.isAbsolute(relativeCategory)) throw new Error('Choose a category inside your Mods folder');
  const segments = relativeCategory.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..')) throw new Error('Invalid category path');
  const root = path.resolve(modsRoot);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (!current.startsWith(`${root}${path.sep}`)) throw new Error('Category escaped the Mods folder');
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('Categories cannot pass through symbolic links');
      if (!info.isDirectory()) throw new Error(`A file blocks the category folder: ${segment}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return current;
}

async function availablePath(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(directory, index === 0 ? fileName : `${stem} (${index})${extension}`);
    try { await access(candidate); }
    catch { return candidate; }
  }
  throw new Error('Could not create a unique filename in this category');
}

async function moveOne(filePath: string, modsRoot: string, relativeCategory: string) {
  const source = path.resolve(filePath);
  const root = path.resolve(modsRoot);
  if (!source.startsWith(`${root}${path.sep}`)) throw new Error('This mod is outside the selected Mods folder');
  if (!allowedExtensions.has(path.extname(source).toLowerCase())) throw new Error('Only supported Sims mod files can be organized');
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error('The selected mod is not a regular file');
  const directory = await safeTargetDirectory(root, relativeCategory);
  if (path.dirname(source).toLowerCase() === directory.toLowerCase()) {
    const verified = await lstat(source);
    if (!verified.isFile()) throw new Error('The selected mod could not be verified on disk');
    return { newPath: source };
  }
  const destination = await availablePath(directory, path.basename(source));
  await rename(source, destination);
  const destinationInfo = await lstat(destination);
  if (!destinationInfo.isFile()) throw new Error('The moved mod could not be verified in its new folder');
  try {
    await access(source);
    throw new Error('The original file is still present, so the move was not completed');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { newPath: destination };
}

export async function moveModToCategory(filePath: string, modsRoot: string, relativeCategory: string) {
  if (await simsIsRunning()) throw new Error('Close The Sims 4 before organizing mod files');
  return moveOne(filePath, modsRoot, relativeCategory);
}

export async function moveModsToCategory(filePaths: string[], modsRoot: string, relativeCategory: string): Promise<BulkMoveResult> {
  if (await simsIsRunning()) throw new Error('Close The Sims 4 before organizing mod files');
  const moved: BulkMoveResult['moved'] = [];
  const errors: BulkMoveResult['errors'] = [];

  for (const filePath of [...new Set(filePaths)]) {
    try {
      const result = await moveOne(filePath, modsRoot, relativeCategory);
      moved.push({ oldPath: filePath, newPath: result.newPath });
    } catch (error) {
      errors.push({ filePath, message: error instanceof Error ? error.message : 'The mod could not be moved' });
    }
  }

  return { moved, errors };
}

export async function moveModsToLocations(requests: ModMoveRequest[], modsRoot: string): Promise<BulkMoveResult> {
  if (await simsIsRunning()) throw new Error('Close The Sims 4 before organizing mod files');
  const moved: BulkMoveResult['moved'] = [];
  const errors: BulkMoveResult['errors'] = [];
  const seen = new Set<string>();

  for (const request of requests) {
    if (seen.has(request.filePath)) continue;
    seen.add(request.filePath);
    try {
      const result = await moveOne(request.filePath, modsRoot, request.relativeCategory);
      moved.push({ oldPath: request.filePath, newPath: result.newPath });
    } catch (error) {
      errors.push({ filePath: request.filePath, message: error instanceof Error ? error.message : 'The mod could not be moved' });
    }
  }

  return { moved, errors };
}

function normalizedFileName(value: string) {
  return path.basename(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function addLookup(map: Map<string, ModPackManifest['files'][number]>, key: string, file: ModPackManifest['files'][number]) {
  if (key && !map.has(key)) map.set(key, file);
}

export async function syncFolderLayoutFromManifests(manifests: ModPackManifest[], scan: ScanResult, modsRoot: string): Promise<FolderLayoutSyncResult> {
  if (await simsIsRunning()) throw new Error('Close The Sims 4 before syncing folder layout');
  const moved: BulkMoveResult['moved'] = [];
  const errors: FolderLayoutSyncResult['errors'] = [];
  let alreadyCorrect = 0;
  let unmatched = 0;
  const remoteByHash = new Map<string, ModPackManifest['files'][number]>();
  const remoteByName = new Map<string, ModPackManifest['files'][number]>();
  const remoteByStem = new Map<string, ModPackManifest['files'][number]>();

  for (const manifest of manifests) {
    for (const remote of manifest.files) {
      const remoteFolder = path.dirname(remote.path);
      if (remoteFolder === '.') continue;
      addLookup(remoteByHash, remote.sha256, remote);
      addLookup(remoteByName, normalizedFileName(remote.name), remote);
      addLookup(remoteByName, normalizedFileName(remote.path), remote);
      addLookup(remoteByStem, path.basename(normalizedFileName(remote.name), path.extname(remote.name).toLowerCase()), remote);
    }
  }

  for (const local of scan.files) {
    const localName = normalizedFileName(local.name);
    const localStem = path.basename(localName, path.extname(localName).toLowerCase());
    const remote = remoteByHash.get(local.hash) ?? remoteByName.get(localName) ?? remoteByStem.get(localStem);
    if (!remote) {
      unmatched += 1;
      continue;
    }
    const remoteFolder = path.dirname(remote.path).replace(/\//g, '\\');
    if (remoteFolder === '.') {
      alreadyCorrect += 1;
      continue;
    }
    const localFolder = path.dirname(local.relativePath).replace(/\//g, '\\').toLowerCase();
    if (localFolder === remoteFolder.toLowerCase()) {
      alreadyCorrect += 1;
      continue;
    }
    try {
      const result = await moveOne(local.path, modsRoot, remoteFolder);
      moved.push({ oldPath: local.path, newPath: result.newPath });
    } catch (error) {
      errors.push({ filePath: local.path, message: error instanceof Error ? error.message : 'The mod could not be moved to match the peer folder layout' });
    }
  }

  return { moved: moved.length, alreadyCorrect, unmatched, errors };
}
