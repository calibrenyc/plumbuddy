import { constants, createWriteStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import yauzl, { type Entry } from 'yauzl';
import sevenBin from '7zip-bin';
import type { BulkInstallChoice, BulkInstallResult, BulkZipEntry, BulkZipPlan } from '../src/types.js';

const supportedExtensions = new Set(['.package', '.ts4script', '.cfg']);
const maxEntries = 20_000;
const maxExpandedBytes = 20 * 1024 * 1024 * 1024;
const maxNestedZipDepth = 3;
const supportedArchiveExtensions = new Set(['.zip', '.rar', '.7z']);
const plans = new Map<string, BulkZipPlan>();

function fileNameFromResponse(url: URL, disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const candidate = encoded ? decodeURIComponent(encoded) : plain ?? decodeURIComponent(url.pathname.split('/').pop() || 'bulk-mods.zip');
  return path.basename(candidate).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'bulk-mods.zip';
}

const locationKeywords: Array<[string, string[]]> = [
  ['Overrides', ['override', 'replacement', 'default']],
  ['Script Mods', ['script', 'mccc', 'wonderfulwhims', 'wickedwhims', 'ui cheats']],
  ['Gameplay', ['gameplay', 'career', 'trait', 'aspiration', 'tuning', 'lumpinou', 'adeepindigo', 'food', 'recipe', 'cookbook', 'pose']],
  ['CAS\\Accessories', ['hat', 'cap', 'earring', 'necklace', 'ring', 'bracelet', 'glasses', 'socks', 'accessory', 'accessories']],
  ['CAS\\Clothes\\Tops', ['shirt', 'tshirt', 'tee', 'top', 'hoodie', 'sweater', 'blouse', 'jacket', 'vest', 'blazer', 'coat', 'cardigan', 'tank']],
  ['CAS\\Clothes\\Bottoms', ['pants', 'jeans', 'skirt', 'shorts', 'leggings', 'joggers', 'slacks', 'bottom']],
  ['CAS\\Clothes\\Dresses', ['dress', 'gown', 'outfit', 'uniform', 'jumpsuit', 'romper', 'bodysuit']],
  ['CAS\\Clothes\\Shoes', ['shoe', 'shoes', 'boot', 'boots', 'heel', 'sneaker', 'sandal', 'pumps', 'loafer', 'crocs']],
  ['CAS\\Hair', ['hair', 'bangs', 'ponytail', 'braid']],
  ['CAS\\Makeup', ['makeup', 'lipstick', 'eyeliner', 'blush', 'shadow', 'tattoo', 'nail']],
  ['CAS\\Genetics', ['skin', 'eyes', 'eyebrow', 'eyelash', 'preset', 'slider', 'genetic']],
  ['BuildBuy\\Kitchen', ['kitchen', 'counter', 'stove', 'fridge', 'sink', 'cabinet']],
  ['BuildBuy\\Bedroom', ['bed', 'dresser', 'nightstand', 'wardrobe']],
  ['BuildBuy\\Bathroom', ['bathroom', 'toilet', 'shower', 'tub', 'bath']],
  ['BuildBuy\\Living Room', ['sofa', 'couch', 'tv', 'television', 'loveseat']],
  ['BuildBuy\\Dining Room', ['dining']],
  ['BuildBuy\\Office', ['desk', 'office', 'computer']],
  ['BuildBuy\\Outdoor', ['garden', 'outdoor', 'patio', 'pool', 'terrain', 'tree']],
  ['BuildBuy\\Build', ['wall', 'floor', 'window', 'door', 'foundation', 'roof', 'column', 'staircase', 'fence']],
  ['BuildBuy\\Decorations', ['clutter', 'decor', 'plant', 'lamp', 'rug', 'mirror', 'poster', 'painting', 'car']],
];

function safeRelativePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || segments.some(segment => segment === '..' || segment === '.')) {
    throw new Error(`Unsafe path found in archive: ${fileName}`);
  }
  return segments.join(path.sep);
}

function safeFolder(value: string) {
  const normalized = value.replace(/\//g, '\\');
  const segments = normalized.split('\\').filter(Boolean);
  if (!segments.length || /^[a-z]:/i.test(normalized) || segments.some(segment => segment === '..' || segment === '.')) throw new Error(`Unsafe install folder: ${value}`);
  return segments.join(path.sep);
}

function isSymbolicLink(entry: Entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

function recommendLocation(archivePath: string) {
  const name = path.basename(archivePath).toLowerCase();
  if (name === 'resource.cfg') return null;
  if (path.extname(name) === '.ts4script') return 'Script Mods';
  const normalized = archivePath.toLowerCase().replace(/[\\/_.()[\]-]/g, ' ');
  return locationKeywords.find(([, keywords]) => keywords.some(keyword => normalized.includes(keyword)))?.[0] ?? null;
}

function displayArchivePath(sourceArchivePath: string | undefined, entryPath: string) {
  return sourceArchivePath ? `${sourceArchivePath} > ${entryPath}` : entryPath;
}

async function extractWithSevenZip(archive: string, outputFolder: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(sevenBin.path7za, ['x', '-y', `-o${outputFolder}`, archive], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Archive extraction failed${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function walkExtractedFiles(root: string) {
  const files: Array<{ absolutePath: string; relativePath: string; size: number }> = [];
  async function walk(directory: string) {
    const items = await readdir(directory, { withFileTypes: true });
    for (const item of items) {
      const absolutePath = path.join(directory, item.name);
      if (item.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!item.isFile()) continue;
      const relativePath = safeRelativePath(path.relative(root, absolutePath));
      const info = await stat(absolutePath);
      files.push({ absolutePath, relativePath, size: info.size });
    }
  }
  await walk(root);
  return files;
}

async function downloadArchive(rawUrl: string, downloadsFolder: string) {
  const url = new URL(rawUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error('Bulk install only supports HTTP and HTTPS archive links');
  await mkdir(downloadsFolder, { recursive: true });
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Plumbuddy/0.1',
        Accept: 'application/zip,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed,application/octet-stream,*/*',
      },
    });
  } catch (error) {
    throw new Error(`Could not reach the archive link. If this is a mod page, open it in Browser and click its download button instead. ${error instanceof Error ? error.message : ''}`.trim());
  }
  if (!response.ok || !response.body) throw new Error(`Could not download archive: server returned ${response.status}`);
  const finalUrl = new URL(response.url);
  const fileName = fileNameFromResponse(finalUrl, response.headers.get('content-disposition'));
  const contentType = response.headers.get('content-type') ?? '';
  const extension = path.extname(fileName).toLowerCase();
  if (!supportedArchiveExtensions.has(extension) && !/zip|rar|7z|octet-stream/i.test(contentType)) {
    throw new Error('That link did not return a ZIP/RAR/7Z file. Use a direct archive download link, or open the page in Browser and click download there.');
  }
  const archiveName = supportedArchiveExtensions.has(extension) ? fileName : `${fileName.replace(/\.[^.]+$/, '') || 'bulk-mods'}.zip`;
  const archivePath = path.join(downloadsFolder, `${Date.now()}-${archiveName}`);
  const handle = createWriteStream(archivePath, { flags: 'wx' });
  await pipeline(Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>), handle);
  return { archivePath, archiveName };
}

export async function prepareBulkZip(rawUrl: string, downloadsFolder: string): Promise<BulkZipPlan> {
  const { archivePath, archiveName } = await downloadArchive(rawUrl, downloadsFolder);
  return prepareBulkZipArchive(archivePath, archiveName);
}

export async function prepareBulkZipFile(filePath: string): Promise<BulkZipPlan> {
  const archivePath = path.resolve(filePath);
  if (!supportedArchiveExtensions.has(path.extname(archivePath).toLowerCase())) throw new Error('Choose a ZIP, RAR, or 7Z archive for Bulk install');
  return prepareBulkZipArchive(archivePath, path.basename(archivePath));
}

export async function prepareBulkZipFiles(filePaths: string[]): Promise<BulkZipPlan> {
  const archives = filePaths.map(filePath => path.resolve(filePath)).filter(filePath => supportedArchiveExtensions.has(path.extname(filePath).toLowerCase()));
  if (!archives.length) throw new Error('Choose one or more ZIP, RAR, or 7Z archives for Bulk install');
  const archiveInfo = archives.map(filePath => ({ path: filePath, name: path.basename(filePath) }));
  return prepareBulkZipArchive(archiveInfo[0].path, archives.length === 1 ? archiveInfo[0].name : `${archives.length} archive bundles`, archiveInfo);
}

async function prepareBulkZipArchive(archivePath: string, archiveName: string, archiveInfo = [{ path: archivePath, name: archiveName }]): Promise<BulkZipPlan> {
  const entries: BulkZipEntry[] = [];
  const counter = { skippedFiles: 0, expandedBytes: 0 };

  async function collectFromZip(zipPath: string, sourceArchivePath: string | undefined, depth: number, rootArchivePath: string) {
    const zip = await yauzl.openPromise(zipPath, { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false });
    for await (const entry of zip.eachEntry()) {
      try {
        if (entries.length + counter.skippedFiles >= maxEntries) throw new Error('Archive contains too many entries');
        if (entry.fileName.endsWith('/')) continue;
        if (isSymbolicLink(entry)) throw new Error(`Symbolic links are not allowed in mod archives: ${entry.fileName}`);
        const archiveEntryPath = safeRelativePath(entry.fileName);
        counter.expandedBytes += entry.uncompressedSize;
        if (counter.expandedBytes > maxExpandedBytes) throw new Error('Archive expands beyond the 20 GB safety limit');
        const extension = path.extname(archiveEntryPath).toLowerCase();
        if (extension === '.zip' && depth < maxNestedZipDepth) {
          const nestedRoot = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-nested-'));
          try {
            const nestedPath = path.join(nestedRoot, path.basename(archiveEntryPath));
            const stream = await zip.openReadStreamPromise(entry);
            await pipeline(stream, createWriteStream(nestedPath, { flags: 'wx' }));
            await collectFromZip(nestedPath, displayArchivePath(sourceArchivePath, archiveEntryPath), depth + 1, rootArchivePath);
          } finally {
            const tempRoot = path.resolve(os.tmpdir());
            if (nestedRoot.startsWith(`${tempRoot}${path.sep}plumbuddy-nested-`)) await rm(nestedRoot, { recursive: true, force: true });
          }
          continue;
        }
        if (!supportedExtensions.has(extension)) {
          counter.skippedFiles += 1;
          continue;
        }
        const displayPath = displayArchivePath(sourceArchivePath, archiveEntryPath);
        const recommendedLocation = recommendLocation(displayPath);
        entries.push({
          id: randomUUID(),
          archivePath: displayPath,
          rootArchivePath,
          sourceArchivePath,
          name: path.basename(archiveEntryPath),
          size: entry.uncompressedSize,
          recommendedLocation,
          selectedLocation: recommendedLocation ?? 'Uncategorized',
          needsReview: !recommendedLocation || /\b(merged|set|collection)\b/i.test(displayPath),
        });
      } finally {
        // Continue reading entries until the ZIP iterator is exhausted.
      }
    }
    zip.close();
  }

  async function collectFromExtractedArchive(archivePath: string, sourceArchivePath: string | undefined, rootArchivePath: string) {
    const extractRoot = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-bulk-rar-'));
    try {
      await extractWithSevenZip(archivePath, extractRoot);
      const files = await walkExtractedFiles(extractRoot);
      for (const file of files) {
        if (entries.length + counter.skippedFiles >= maxEntries) throw new Error('Archive contains too many entries');
        counter.expandedBytes += file.size;
        if (counter.expandedBytes > maxExpandedBytes) throw new Error('Archive expands beyond the 20 GB safety limit');
        const extension = path.extname(file.relativePath).toLowerCase();
        if (!supportedExtensions.has(extension)) {
          counter.skippedFiles += 1;
          continue;
        }
        const displayPath = displayArchivePath(sourceArchivePath, file.relativePath);
        const recommendedLocation = recommendLocation(displayPath);
        entries.push({
          id: randomUUID(),
          archivePath: displayPath,
          rootArchivePath,
          sourceArchivePath,
          name: path.basename(file.relativePath),
          size: file.size,
          recommendedLocation,
          selectedLocation: recommendedLocation ?? 'Uncategorized',
          needsReview: !recommendedLocation || /\b(merged|set|collection)\b/i.test(displayPath),
        });
      }
    } finally {
      const tempRoot = path.resolve(os.tmpdir());
      if (extractRoot.startsWith(`${tempRoot}${path.sep}plumbuddy-bulk-rar-`)) await rm(extractRoot, { recursive: true, force: true });
    }
  }

  for (const archive of archiveInfo) {
    const extension = path.extname(archive.path).toLowerCase();
    if (extension === '.zip') await collectFromZip(archive.path, archiveInfo.length > 1 ? archive.name : undefined, 0, archive.path);
    else await collectFromExtractedArchive(archive.path, archiveInfo.length > 1 ? archive.name : undefined, archive.path);
  }
  if (!entries.length) throw new Error('The archive does not contain any supported Sims mod files');
  const plan = { id: randomUUID(), archivePath, archiveName, archives: archiveInfo, entries, skippedFiles: counter.skippedFiles };
  plans.set(plan.id, plan);
  return plan;
}

async function copyUnique(source: string, desiredPath: string) {
  await mkdir(path.dirname(desiredPath), { recursive: true });
  const extension = path.extname(desiredPath);
  const stem = path.basename(desiredPath, extension);
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(path.dirname(desiredPath), index === 0 ? `${stem}${extension}` : `${stem} (${index})${extension}`);
    try {
      await copyFile(source, candidate, constants.COPYFILE_EXCL);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not create a unique mod filename');
}

export async function installBulkZip(planId: string, choices: BulkInstallChoice[], modsFolder: string): Promise<BulkInstallResult> {
  const plan = plans.get(planId);
  if (!plan) throw new Error('Bulk ZIP plan expired. Prepare the ZIP again.');
  const choiceById = new Map(choices.map(choice => [choice.id, choice]));
  const staging = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-bulk-'));
  let installedFiles = 0;
  let skippedFiles = plan.skippedFiles;
  const plannedByArchive = new Map<string, Map<string, BulkZipEntry>>();
  for (const entry of plan.entries) {
    const rootArchivePath = entry.rootArchivePath ?? plan.archivePath;
    const archiveEntries = plannedByArchive.get(rootArchivePath) ?? new Map<string, BulkZipEntry>();
    archiveEntries.set(entry.archivePath, entry);
    plannedByArchive.set(rootArchivePath, archiveEntries);
  }
  try {
    async function installFromZip(zipPath: string, sourceArchivePath: string | undefined, depth: number, rootArchivePath: string) {
      const zip = await yauzl.openPromise(zipPath, { autoClose: false, lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false });
      for await (const entry of zip.eachEntry()) {
        if (entry.fileName.endsWith('/')) continue;
        const archiveEntryPath = safeRelativePath(entry.fileName);
        const extension = path.extname(archiveEntryPath).toLowerCase();
        if (extension === '.zip' && depth < maxNestedZipDepth) {
          const nestedRoot = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-nested-install-'));
          try {
            const nestedPath = path.join(nestedRoot, path.basename(archiveEntryPath));
            const stream = await zip.openReadStreamPromise(entry);
            await pipeline(stream, createWriteStream(nestedPath, { flags: 'wx' }));
            await installFromZip(nestedPath, displayArchivePath(sourceArchivePath, archiveEntryPath), depth + 1, rootArchivePath);
          } finally {
            const tempRoot = path.resolve(os.tmpdir());
            if (nestedRoot.startsWith(`${tempRoot}${path.sep}plumbuddy-nested-install-`)) await rm(nestedRoot, { recursive: true, force: true });
          }
          continue;
        }
        const displayPath = displayArchivePath(sourceArchivePath, archiveEntryPath);
        const plannedEntry = plannedByArchive.get(rootArchivePath)?.get(displayPath);
        if (!plannedEntry) continue;
        const choice = choiceById.get(plannedEntry.id);
        if (choice?.skip) {
          skippedFiles += 1;
          continue;
        }
        const selectedLocation = safeFolder(choice?.selectedLocation || plannedEntry.selectedLocation || 'Uncategorized');
        const stagedPath = path.join(staging, archiveEntryPath);
        await mkdir(path.dirname(stagedPath), { recursive: true });
        const stream = await zip.openReadStreamPromise(entry);
        await pipeline(stream, createWriteStream(stagedPath, { flags: 'wx' }));
        await copyUnique(stagedPath, path.join(modsFolder, selectedLocation, path.basename(archiveEntryPath)));
        installedFiles += 1;
      }
      zip.close();
    }
    async function installFromExtractedArchive(archivePath: string, sourceArchivePath: string | undefined, rootArchivePath: string) {
      const extractRoot = await mkdtemp(path.join(os.tmpdir(), 'plumbuddy-bulk-rar-install-'));
      try {
        await extractWithSevenZip(archivePath, extractRoot);
        const files = await walkExtractedFiles(extractRoot);
        for (const file of files) {
          const displayPath = displayArchivePath(sourceArchivePath, file.relativePath);
          const plannedEntry = plannedByArchive.get(rootArchivePath)?.get(displayPath);
          if (!plannedEntry) continue;
          const choice = choiceById.get(plannedEntry.id);
          if (choice?.skip) {
            skippedFiles += 1;
            continue;
          }
          const selectedLocation = safeFolder(choice?.selectedLocation || plannedEntry.selectedLocation || 'Uncategorized');
          await copyUnique(file.absolutePath, path.join(modsFolder, selectedLocation, path.basename(file.relativePath)));
          installedFiles += 1;
        }
      } finally {
        const tempRoot = path.resolve(os.tmpdir());
        if (extractRoot.startsWith(`${tempRoot}${path.sep}plumbuddy-bulk-rar-install-`)) await rm(extractRoot, { recursive: true, force: true });
      }
    }
    for (const archive of plan.archives ?? [{ path: plan.archivePath, name: plan.archiveName }]) {
      const extension = path.extname(archive.path).toLowerCase();
      if (extension === '.zip') await installFromZip(archive.path, (plan.archives?.length ?? 1) > 1 ? archive.name : undefined, 0, archive.path);
      else await installFromExtractedArchive(archive.path, (plan.archives?.length ?? 1) > 1 ? archive.name : undefined, archive.path);
    }
    for (const archive of plan.archives ?? [{ path: plan.archivePath, name: plan.archiveName }]) await unlink(archive.path).catch(() => undefined);
    plans.delete(planId);
    return { installedFiles, skippedFiles, archiveDeleted: true };
  } finally {
    const tempRoot = path.resolve(os.tmpdir());
    if (staging.startsWith(`${tempRoot}${path.sep}plumbuddy-bulk-`)) await rm(staging, { recursive: true, force: true });
  }
}
