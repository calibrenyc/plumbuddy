import { access, mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import dgram, { type Socket } from 'node:dgram';
import { randomUUID } from 'node:crypto';
import type { DiscoveredHostedPack, HostedPackInstallProgress, HostedPackInstallResult, HostedPackSession, HostTransferStatus, ModPackManifest, ModPackRecord, PackComparisonResult, ScanResult } from '../src/types.js';
import { compareManifestData } from './operations.js';

interface HostSessionState extends HostedPackSession {
  token: string;
  server: Server;
  modsRoot: string;
  manifest: ModPackManifest;
}

const sessions = new Map<string, HostSessionState>();
const discoveryPort = 43184;
let broadcaster: Socket | null = null;
let broadcastTimer: NodeJS.Timeout | null = null;
let discoverySocket: Socket | null = null;
const discovered = new Map<string, DiscoveredHostedPack>();
const transfers: HostTransferStatus[] = [];
let activeCollabSyncController: AbortController | null = null;

function normalizeHostUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error('Paste the host connection link first');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function localIpAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function ensureBroadcaster() {
  if (broadcaster) return;
  broadcaster = dgram.createSocket('udp4');
  broadcaster.bind(() => broadcaster?.setBroadcast(true));
}

function broadcastSessions() {
  if (!sessions.size) return;
  ensureBroadcaster();
  for (const session of sessions.values()) {
    const message = Buffer.from(JSON.stringify({
      type: 'plumbuddy-pack',
      name: session.name,
      version: session.version,
      shareCode: session.shareCode,
      url: session.url,
      fileCount: session.fileCount,
      hostName: session.hostName,
      collaboration: session.collaboration,
      host: os.hostname(),
    }));
    broadcaster?.send(message, discoveryPort, '255.255.255.255');
  }
}

function startBroadcasting() {
  ensureBroadcaster();
  broadcastSessions();
  if (!broadcastTimer) broadcastTimer = setInterval(broadcastSessions, 2500);
}

function stopBroadcastingIfIdle() {
  if (sessions.size) return;
  if (broadcastTimer) clearInterval(broadcastTimer);
  broadcastTimer = null;
  broadcaster?.close();
  broadcaster = null;
}

function ensureDiscoverySocket() {
  if (discoverySocket) return;
  discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  discoverySocket.on('message', (message, remote) => {
    try {
      const data = JSON.parse(message.toString()) as Partial<DiscoveredHostedPack> & { type?: string };
      if (data.type !== 'plumbuddy-pack' || !data.url || !data.name) return;
      discovered.set(data.url, {
        name: data.name,
        version: Number(data.version ?? 1),
        shareCode: data.shareCode ?? 'LAN',
        url: data.url,
        fileCount: Number(data.fileCount ?? 0),
        host: data.host ?? remote.address,
        hostName: data.hostName,
        collaboration: Boolean(data.collaboration),
        seenAt: new Date().toISOString(),
      });
    } catch {
      // Ignore non-Plumbuddy broadcasts.
    }
  });
  discoverySocket.bind(discoveryPort, () => discoverySocket?.setBroadcast(true));
}

function safeManifestPath(modsRoot: string, relativePath: string) {
  const root = path.resolve(modsRoot);
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Unsafe pack path: ${relativePath}`);
  }
  const fullPath = path.resolve(root, ...segments);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error(`Pack path escaped the Mods folder: ${relativePath}`);
  return fullPath;
}

function safeFolderName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Hosted Pack';
}

async function availableManifestFiles(manifest: ModPackManifest, sourceRoot: string) {
  const available: ModPackManifest['files'] = [];
  for (const file of manifest.files) {
    try {
      const info = await stat(safeManifestPath(sourceRoot, file.path));
      if (info.isFile() && info.size === file.size) available.push(file);
    } catch {
      // Stale manifest entry. It will not be advertised or requested by clients.
    }
  }
  return available;
}

function streamPackFile(request: http.IncomingMessage, response: http.ServerResponse, session: HostSessionState, relativePath: string) {
  const manifestFile = session.manifest.files.find(file => file.path === relativePath);
  if (!manifestFile) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Pack file not found');
    return;
  }
  const client = request.socket.remoteAddress?.replace(/^::ffff:/, '') ?? 'Unknown client';
  let transfer = transfers.find(item => item.packId === session.packId && item.client === client && item.status === 'downloading');
  if (!transfer) {
    transfer = {
      id: randomUUID(),
      packId: session.packId,
      packName: session.name,
      client,
      status: 'downloading',
      startedAt: new Date().toISOString(),
      message: `Sending ${manifestFile.path}`,
    };
    transfers.unshift(transfer);
    transfers.splice(40);
  } else {
    transfer.message = `Sending ${manifestFile.path}`;
  }
  response.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': String(manifestFile.size),
    'content-disposition': `attachment; filename="${path.basename(manifestFile.path).replace(/[^\w.-]+/g, '-')}"`,
  });
  const stream = open(safeManifestPath(session.modsRoot, manifestFile.path), 'r').then(handle => {
    const reader = handle.createReadStream();
    reader.on('error', () => {
      transfer.status = 'failed';
      transfer.finishedAt = new Date().toISOString();
      transfer.message = `Failed while sending ${manifestFile.path}`;
      response.end();
    });
    reader.on('end', () => void handle.close());
    reader.pipe(response);
  });
  void stream.catch(() => {
    transfer.status = 'failed';
    transfer.finishedAt = new Date().toISOString();
    transfer.message = `Could not open ${manifestFile.path}`;
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  response.on('finish', () => {
    if (transfer.status === 'downloading') {
      transfer.status = 'completed';
      transfer.finishedAt = new Date().toISOString();
      transfer.message = `Sent ${manifestFile.path}`;
    }
  });
  response.on('close', () => {
    if (transfer.status === 'downloading') {
      transfer.status = 'cancelled';
      transfer.finishedAt = new Date().toISOString();
      transfer.message = `Client disconnected during ${manifestFile.path}`;
    }
  });
}

export async function startPackHost(record: ModPackRecord, modsRoot: string, options?: { collaboration?: boolean; hostName?: string }): Promise<HostedPackSession> {
  const existing = sessions.get(record.id);
  if (existing) return existing;
  const storedManifest = JSON.parse(await readFile(record.manifestPath, 'utf8')) as ModPackManifest;
  let manifest: ModPackManifest = {
    ...storedManifest,
    collaboration: Boolean(options?.collaboration || storedManifest.collaboration),
    collaborators: [...new Set([...(storedManifest.collaborators ?? []), options?.hostName].filter(Boolean) as string[])],
  };
  const token = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const sourceRoot = await resolveHostSource(record, manifest, modsRoot);
  const availableFiles = await availableManifestFiles(manifest, sourceRoot);
  if (!availableFiles.length) throw new Error(`Could not find local files for "${manifest.name}". Try activating or re-syncing this pack.`);
  if (availableFiles.length !== manifest.files.length || path.resolve(manifest.sourceFolder || '').toLowerCase() !== path.resolve(sourceRoot).toLowerCase()) {
    manifest = { ...manifest, sourceFolder: sourceRoot, updatedAt: new Date().toISOString(), files: availableFiles };
    await writeFile(record.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    if (record.sharePath) await writeFile(record.sharePath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const base = `/pack/${token}`;
    response.setHeader('access-control-allow-origin', '*');
    if (url.pathname === base || url.pathname === `${base}/manifest`) {
      const session = sessions.get(record.id);
      const activeManifest = session?.manifest ?? manifest;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(activeManifest));
      return;
    }
    if (url.pathname === `${base}/file`) {
      const session = sessions.get(record.id);
      if (!session) {
        response.writeHead(404, { 'content-type': 'text/plain' });
        response.end('Pack session not found');
        return;
      }
      const requestedPath = url.searchParams.get('path') ?? '';
      streamPackFile(request, response, session, requestedPath);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Pack session not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start pack host');
  const port = address.port;
  const ip = localIpAddress();
  const state: HostSessionState = {
    packId: record.id,
    name: manifest.name,
    version: Number(manifest.version ?? record.version ?? 1),
    shareCode: manifest.shareCode ?? record.shareCode,
    fileCount: manifest.files.length,
    url: `http://${ip}:${port}/pack/${token}`,
    localUrl: `http://127.0.0.1:${port}/pack/${token}`,
    hostName: options?.hostName,
    collaboration: manifest.collaboration,
    token,
    server,
    modsRoot: sourceRoot,
    manifest,
  };
  sessions.set(record.id, state);
  startBroadcasting();
  return state;
}

export async function refreshPackHost(record: ModPackRecord, modsRoot: string) {
  const session = sessions.get(record.id);
  if (!session) return null;
  const storedManifest = JSON.parse(await readFile(record.manifestPath, 'utf8')) as ModPackManifest;
  const sourceRoot = await resolveHostSource(record, storedManifest, modsRoot);
  const availableFiles = await availableManifestFiles(storedManifest, sourceRoot);
  if (!availableFiles.length) return session;
  const manifest: ModPackManifest = {
    ...storedManifest,
    sourceFolder: sourceRoot,
    collaboration: session.collaboration || storedManifest.collaboration,
    collaborators: storedManifest.collaborators,
    files: availableFiles,
  };
  session.modsRoot = sourceRoot;
  session.manifest = manifest;
  session.version = Number(manifest.version ?? record.version ?? session.version);
  session.fileCount = manifest.files.length;
  session.name = manifest.name;
  session.shareCode = manifest.shareCode;
  broadcastSessions();
  return session;
}

export async function stopPackHost(packId: string) {
  const session = sessions.get(packId);
  if (!session) return;
  await new Promise<void>(resolve => session.server.close(() => resolve()));
  sessions.delete(packId);
  stopBroadcastingIfIdle();
}

export function discoverHostedPacks(): DiscoveredHostedPack[] {
  ensureDiscoverySocket();
  const cutoff = Date.now() - 30_000;
  for (const [url, pack] of discovered) {
    if (new Date(pack.seenAt).getTime() < cutoff) discovered.delete(url);
  }
  broadcastSessions();
  return [...discovered.values()].sort((a, b) => b.seenAt.localeCompare(a.seenAt));
}

export function listHostTransfers(): HostTransferStatus[] {
  return transfers.slice(0, 40);
}

export async function fetchHostedManifest(rawUrl: string): Promise<ModPackManifest> {
  const base = new URL(normalizeHostUrl(rawUrl));
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Pack connections must use an HTTP URL from the host');
  const manifestUrl = base.pathname.endsWith('/manifest') ? base : new URL(`${base.pathname.replace(/\/$/, '')}/manifest`, base);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error(`The host returned ${response.status}`);
  return response.json() as Promise<ModPackManifest>;
}

export async function connectHostedPack(rawUrl: string, scan: ScanResult): Promise<PackComparisonResult> {
  const manifest = await fetchHostedManifest(rawUrl);
  const result = compareManifestData(manifest, scan);
  result.hostUrl = normalizeHostUrl(rawUrl);
  return result;
}

async function availablePath(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(directory, index === 0 ? fileName : `${stem} (${index})${extension}`);
    try { await access(candidate); }
    catch { return candidate; }
  }
  throw new Error('Could not create a unique transfer filename');
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileSizeMatches(filePath: string, size: number) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size === size;
  } catch {
    return false;
  }
}

async function packSourceMatchRatio(manifest: ModPackManifest, sourceRoot: string) {
  if (!manifest.files.length) return 0;
  let matched = 0;
  for (const file of manifest.files) {
    try {
      const info = await stat(safeManifestPath(sourceRoot, file.path));
      if (info.isFile() && info.size === file.size) matched += 1;
    } catch {
      // Missing file: not a source match.
    }
  }
  return matched / manifest.files.length;
}

async function findStoredModsFolder(packDirectory: string) {
  try {
    const entries = await readdir(packDirectory, { withFileTypes: true });
    const match = entries.find(entry => entry.isDirectory() && entry.name.toLowerCase() === 'mods');
    return match ? path.join(packDirectory, match.name) : null;
  } catch {
    return null;
  }
}

async function resolveHostSource(record: ModPackRecord, manifest: ModPackManifest, liveModsRoot: string) {
  const candidates = [
    path.resolve(liveModsRoot),
    path.resolve(manifest.sourceFolder || liveModsRoot),
    await findStoredModsFolder(path.dirname(record.manifestPath)),
  ].filter(Boolean) as string[];
  let best = { sourceRoot: candidates[0], ratio: -1 };
  for (const candidate of [...new Set(candidates.map(item => path.resolve(item)))]) {
    const ratio = await packSourceMatchRatio(manifest, candidate);
    if (ratio > best.ratio) best = { sourceRoot: candidate, ratio };
    if (ratio >= 1) break;
  }
  if (best.ratio <= 0) throw new Error(`Could not find local files for "${manifest.name}". Try activating or re-syncing this pack.`);
  return best.sourceRoot;
}

export async function installHostedPack(rawUrl: string, downloadsFolder: string, modsFolder: string, packStorage: string, onProgress?: (progress: HostedPackInstallProgress) => void): Promise<HostedPackInstallResult> {
  const progress = (update: HostedPackInstallProgress) => onProgress?.(update);
  progress({ phase: 'preparing', message: 'Connecting to the host computer...' });
  const manifest = await fetchHostedManifest(rawUrl);
  const base = new URL(normalizeHostUrl(rawUrl));
  await mkdir(path.resolve(downloadsFolder), { recursive: true });
  const version = Number(manifest.version ?? 1);
  const gameFolder = path.dirname(path.resolve(modsFolder));
  const localPackStorage = path.join(gameFolder, 'Plumbuddy Mod Packs');
  const packRoot = path.join(localPackStorage, `${safeFolderName(manifest.name)}_${safeFolderName(manifest.shareCode ?? manifest.id)}_v${version}`);
  const packModsRoot = path.join(packRoot, 'Mods');
  await mkdir(packModsRoot, { recursive: true });
  progress({ phase: 'preparing', total: manifest.files.length, message: `Saving ${manifest.files.length} files to ${packModsRoot}` });
  let installedFiles = 0;
  for (const [index, file] of manifest.files.entries()) {
    const destination = safeManifestPath(packModsRoot, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (await fileSizeMatches(destination, file.size)) {
      installedFiles += 1;
      progress({ phase: 'saved', file: file.path, index: index + 1, total: manifest.files.length, bytes: file.size, message: `Already saved ${index + 1}/${manifest.files.length}: ${file.path}` });
      continue;
    }
    let saved = false;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 4 && !saved; attempt += 1) {
      const fileUrl = new URL(`${base.pathname.replace(/\/$/, '')}/file`, base);
      fileUrl.searchParams.set('path', file.path);
      progress({ phase: 'downloading', file: file.path, index: index + 1, total: manifest.files.length, message: `${attempt > 1 ? `Retry ${attempt}/4 - ` : ''}Downloading ${index + 1}/${manifest.files.length}: ${file.path}` });
      const partialPath = await availablePath(path.dirname(destination), `${path.basename(destination)}.part`);
      let bytes = 0;
      try {
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`The host returned ${response.status} for ${file.path}`);
        const handle = await open(partialPath, 'wx');
        try {
          if (!response.body) throw new Error(`The host did not send ${file.path}`);
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await handle.write(value);
            bytes += value.byteLength;
            if (bytes === value.byteLength || bytes === file.size || bytes % (8 * 1024 * 1024) < value.byteLength) {
              progress({ phase: 'downloading', file: file.path, index: index + 1, total: manifest.files.length, bytes, message: `Downloading ${index + 1}/${manifest.files.length}: ${file.path}` });
            }
          }
        } finally {
          await handle.close();
        }
        progress({ phase: 'writing', file: file.path, index: index + 1, total: manifest.files.length, bytes, message: `Moving ${index + 1}/${manifest.files.length} into the local pack folder: ${file.path}` });
        await unlink(destination).catch(() => undefined);
        await rename(partialPath, destination);
        installedFiles += 1;
        saved = true;
        progress({ phase: 'saved', file: file.path, index: index + 1, total: manifest.files.length, bytes, message: `Saved ${index + 1}/${manifest.files.length}: ${file.path}` });
      } catch (error) {
        lastError = error;
        await unlink(partialPath).catch(() => undefined);
        progress({ phase: 'failed', file: file.path, index: index + 1, total: manifest.files.length, bytes, message: `Attempt ${attempt}/4 failed for ${file.path}: ${error instanceof Error ? error.message : 'fetch failed'}` });
        if (attempt < 4) await wait(1000 * attempt);
      }
    }
    if (!saved) throw lastError instanceof Error ? lastError : new Error(`Could not download ${file.path}`);
  }
  const manifestPath = path.join(packRoot, 'plumbuddy.manifest.json');
  const sharePath = path.join(packRoot, `${safeFolderName(manifest.name)}_${safeFolderName(manifest.shareCode ?? 'LAN')}_v${version}.plumbuddy-pack.json`);
  const storedManifest: ModPackManifest = {
    ...manifest,
    collaboration: Boolean(manifest.collaboration),
    collaborators: [...new Set([...(manifest.collaborators ?? [])])],
    sourceFolder: packModsRoot,
  };
  await writeFile(manifestPath, JSON.stringify(storedManifest, null, 2), 'utf8');
  await writeFile(sharePath, JSON.stringify(storedManifest, null, 2), 'utf8');
  const now = new Date().toISOString();
  const installedPack: ModPackRecord = {
    id: manifest.id,
    name: manifest.name,
    createdAt: now,
    updatedAt: manifest.updatedAt ?? now,
    version,
    shareCode: manifest.shareCode,
    fileCount: manifest.files.length,
    totalSize: manifest.files.reduce((sum, file) => sum + file.size, 0),
    manifestPath,
    sharePath,
  };
  progress({ phase: 'complete', total: manifest.files.length, message: `Finished saving ${installedFiles} files. Ready for hotswap.` });
  return { packName: manifest.name, version, installedFiles, archiveDeleted: true, installFolder: packModsRoot, installedPack };
}

export async function syncCollabPacks(rawUrls: string[], modsFolder: string, scan: ScanResult, onProgress?: (progress: HostedPackInstallProgress) => void) {
  if (activeCollabSyncController) throw new Error('A collab sync is already running');
  activeCollabSyncController = new AbortController();
  const signal = activeCollabSyncController.signal;
  const progress = (update: HostedPackInstallProgress) => onProgress?.(update);
  try {
    const urls = [...new Set(rawUrls.map(normalizeHostUrl))];
    if (!urls.length) throw new Error('No collab peers are available to sync');
    progress({ phase: 'preparing', message: `Checking ${urls.length} collab peer${urls.length === 1 ? '' : 's'}...` });
    const peers = await Promise.all(urls.map(async rawUrl => ({ rawUrl, base: new URL(rawUrl), manifest: await fetchHostedManifest(rawUrl) })));
    const packName = peers[0]?.manifest.name ?? 'Collab pack';
    const files = new Map<string, { rawUrl: string; base: URL; file: ModPackManifest['files'][number] }>();
    for (const peer of peers) {
      for (const file of peer.manifest.files) {
        const existing = files.get(file.sha256);
        if (!existing) files.set(file.sha256, { rawUrl: peer.rawUrl, base: peer.base, file });
      }
    }

    let syncedFiles = 0;
    let skippedFiles = 0;
    let movedExisting = 0;
    const localByHash = new Map(scan.files.filter(file => file.hash).map(file => [file.hash, file]));
    const localByName = new Map(scan.files.map(file => [file.name.toLowerCase(), file]));
    const allFiles = [...files.values()];
    const workItems: typeof allFiles = [];
    for (const item of allFiles) {
      const destination = safeManifestPath(modsFolder, item.file.path);
      if (localByHash.has(item.file.sha256) || await fileSizeMatches(destination, item.file.size)) {
        skippedFiles += 1;
      } else {
        workItems.push(item);
      }
    }
    if (!workItems.length) {
      progress({ phase: 'complete', total: allFiles.length, message: `Collab sync complete: all ${skippedFiles} files already match locally.` });
      return { packName, peerCount: peers.length, syncedFiles, skippedFiles, movedFiles: movedExisting };
    }
    progress({ phase: 'preparing', index: 0, total: workItems.length, message: `${workItems.length} file${workItems.length === 1 ? '' : 's'} need syncing; ${skippedFiles} already match.` });
    for (const [index, item] of workItems.entries()) {
      if (signal.aborted) throw new Error('Collab sync cancelled');
      const destination = safeManifestPath(modsFolder, item.file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      const localMatch = localByHash.get(item.file.sha256) ?? localByName.get(item.file.name.toLowerCase());
      if (localMatch && path.resolve(localMatch.path).toLowerCase() !== path.resolve(destination).toLowerCase()) {
        try {
          await access(destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await rename(localMatch.path, destination);
          localByHash.set(item.file.sha256, { ...localMatch, path: destination, relativePath: item.file.path });
          localByName.set(item.file.name.toLowerCase(), { ...localMatch, path: destination, relativePath: item.file.path });
          movedExisting += 1;
          skippedFiles += 1;
          progress({ phase: 'saved', file: item.file.path, index: index + 1, total: workItems.length, bytes: item.file.size, message: `Moved existing mod into synced folder ${index + 1}/${workItems.length}: ${item.file.path}` });
          continue;
        }
      }

      let saved = false;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 4 && !saved; attempt += 1) {
        if (signal.aborted) throw new Error('Collab sync cancelled');
        const fileUrl = new URL(`${item.base.pathname.replace(/\/$/, '')}/file`, item.base);
        fileUrl.searchParams.set('path', item.file.path);
        const partialPath = await availablePath(path.dirname(destination), `${path.basename(destination)}.part`);
        let bytes = 0;
        progress({ phase: 'downloading', file: item.file.path, index: index + 1, total: workItems.length, message: `${attempt > 1 ? `Retry ${attempt}/4 - ` : ''}Syncing ${index + 1}/${workItems.length}: ${item.file.path}` });
        try {
          const response = await fetch(fileUrl, { signal });
          if (!response.ok) throw new Error(`The peer returned ${response.status} for ${item.file.path}`);
          if (!response.body) throw new Error(`The peer did not send ${item.file.path}`);
          const handle = await open(partialPath, 'wx');
          try {
            const reader = response.body.getReader();
            while (true) {
              if (signal.aborted) throw new Error('Collab sync cancelled');
              const { done, value } = await reader.read();
              if (done) break;
              await handle.write(value);
              bytes += value.byteLength;
              if (bytes === value.byteLength || bytes === item.file.size || bytes % (8 * 1024 * 1024) < value.byteLength) {
                progress({ phase: 'downloading', file: item.file.path, index: index + 1, total: workItems.length, bytes, message: `Syncing ${index + 1}/${workItems.length}: ${item.file.path}` });
              }
            }
          } finally {
            await handle.close();
          }
          await unlink(destination).catch(() => undefined);
          await rename(partialPath, destination);
          syncedFiles += 1;
          saved = true;
          const savedLocal = {
            id: item.file.sha256,
            name: item.file.name,
            path: destination,
            relativePath: item.file.path,
            extension: path.extname(item.file.name).toLowerCase(),
            size: item.file.size,
            modifiedAt: new Date().toISOString(),
            hash: item.file.sha256,
            category: item.file.category,
            enabled: true,
            duplicate: false,
            depthIssue: false,
            recommendedLocation: null,
            categoryMismatch: false,
          };
          localByHash.set(item.file.sha256, savedLocal);
          localByName.set(item.file.name.toLowerCase(), savedLocal);
          progress({ phase: 'saved', file: item.file.path, index: index + 1, total: workItems.length, bytes, message: `Synced ${index + 1}/${workItems.length}: ${item.file.path}` });
        } catch (error) {
          lastError = error;
          await unlink(partialPath).catch(() => undefined);
          progress({ phase: 'failed', file: item.file.path, index: index + 1, total: workItems.length, bytes, message: `Attempt ${attempt}/4 failed for ${item.file.path}: ${error instanceof Error ? error.message : 'transfer failed'}` });
          if (signal.aborted) throw new Error('Collab sync cancelled');
          if (attempt < 4) await wait(1000 * attempt);
        }
      }
      if (!saved) throw lastError instanceof Error ? lastError : new Error(`Could not sync ${item.file.path}`);
    }

    progress({ phase: 'complete', total: workItems.length, message: `Collab sync complete: ${syncedFiles} downloaded, ${movedExisting} moved locally, ${skippedFiles} already matched.` });
    return { packName, peerCount: peers.length, syncedFiles, skippedFiles, movedFiles: movedExisting };
  } finally {
    activeCollabSyncController = null;
  }
}

export function cancelCollabSync() {
  if (!activeCollabSyncController) return false;
  activeCollabSyncController.abort();
  return true;
}
