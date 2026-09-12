import { constants, createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry } from 'yauzl';

const installableExtensions = new Set(['.package', '.ts4script', '.cfg']);
const maxEntries = 20_000;
const maxExpandedBytes = 20 * 1024 * 1024 * 1024;

export interface ExtractionResult {
  installedPaths: string[];
  skippedFiles: number;
  archiveDeleted: boolean;
}

function safeRelativePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error(`Unsafe path found in archive: ${fileName}`);
  }
  return segments.join(path.sep);
}

function isSymbolicLink(entry: Entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

async function ensureSafeDirectory(root: string, relativeDirectory: string) {
  const absoluteRoot = path.resolve(root);
  await mkdir(absoluteRoot, { recursive: true });
  let current = absoluteRoot;
  for (const segment of relativeDirectory.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!current.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error('Archive destination escaped the selected install folder');
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`A symbolic link blocks the install path: ${current}`);
      if (!info.isDirectory()) throw new Error(`A file blocks the install folder: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await mkdir(current);
    }
  }
  return current;
}

async function copyToInstall(source: string, desiredPath: string, replaceExisting: boolean) {
  if (replaceExisting) {
    await copyFile(source, desiredPath);
    return desiredPath;
  }
  const extension = path.extname(desiredPath);
  const stem = path.basename(desiredPath, extension);
  const directory = path.dirname(desiredPath);
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(directory, index === 0 ? `${stem}${extension}` : `${stem} (${index})${extension}`);
    try { await copyFile(source, candidate, constants.COPYFILE_EXCL); return candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  throw new Error('Could not create a unique mod filename');
}

export async function extractZipAndDelete(archivePath: string, installRoot: string, downloadsRoot: string, options: { replaceExisting?: boolean } = {}): Promise<ExtractionResult> {
  const archive = path.resolve(archivePath);
  const safeDownloadsRoot = path.resolve(downloadsRoot);
  if (!archive.startsWith(`${safeDownloadsRoot}${path.sep}`)) throw new Error('The archive is outside Plumbuddy’s download storage');
  if (path.extname(archive).toLowerCase() !== '.zip') throw new Error('Only ZIP extraction is currently supported');

  const staging = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-extract-'));
  try {
    const zip = await yauzl.openPromise(archive, { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false });
    const files: Array<{ entry: Entry; relativePath: string }> = [];
    let skippedFiles = 0;
    let expandedBytes = 0;
    try {
      for await (const entry of zip.eachEntry()) {
        if (files.length + skippedFiles >= maxEntries) throw new Error('Archive contains too many entries');
        const relativePath = safeRelativePath(entry.fileName);
        if (isSymbolicLink(entry)) throw new Error(`Symbolic links are not allowed in mod archives: ${entry.fileName}`);
        if (entry.fileName.endsWith('/')) continue;
        expandedBytes += entry.uncompressedSize;
        if (expandedBytes > maxExpandedBytes) throw new Error('Archive expands beyond the 20 GB safety limit');
        if (!installableExtensions.has(path.extname(relativePath).toLowerCase())) { skippedFiles += 1; continue; }
        files.push({ entry, relativePath });
      }
      if (!files.length) throw new Error('The ZIP does not contain any supported Sims mod files');

      for (const file of files) {
        const stagedPath = path.resolve(staging, file.relativePath);
        if (!stagedPath.startsWith(`${staging}${path.sep}`)) throw new Error('Archive entry escaped the temporary extraction folder');
        await mkdir(path.dirname(stagedPath), { recursive: true });
        const stream = await zip.openReadStreamPromise(file.entry);
        await pipeline(stream, createWriteStream(stagedPath, { flags: 'wx' }));
      }
    } finally { zip.close(); }

    const installedPaths: string[] = [];
    for (const file of files) {
      const relativeDirectory = path.dirname(file.relativePath) === '.' ? '' : path.dirname(file.relativePath);
      const destinationDirectory = await ensureSafeDirectory(installRoot, relativeDirectory);
      installedPaths.push(await copyToInstall(path.join(staging, file.relativePath), path.join(destinationDirectory, path.basename(file.relativePath)), Boolean(options.replaceExisting)));
    }
    await unlink(archive);
    return { installedPaths, skippedFiles, archiveDeleted: true };
  } finally {
    const tempRoot = path.resolve(os.tmpdir());
    if (staging.startsWith(`${tempRoot}${path.sep}plumbuddy-extract-`)) await rm(staging, { recursive: true, force: true });
  }
}
