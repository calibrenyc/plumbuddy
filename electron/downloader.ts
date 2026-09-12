import { access, mkdir, open, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadOptions, DownloadResult } from '../src/types.js';
import { extractZipAndDelete } from './extractor.js';

const allowedExtensions = new Set(['.package', '.ts4script', '.cfg', '.zip', '.rar', '.7z']);
const directlyInstallable = new Set(['.package', '.ts4script', '.cfg']);
const activeDownloads = new Map<string, AbortController>();

function fileNameFromResponse(url: URL, disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const candidate = encoded ? decodeURIComponent(encoded) : plain ?? decodeURIComponent(url.pathname.split('/').pop() || 'download');
  return path.basename(candidate).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim();
}

async function availablePath(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(directory, index === 0 ? fileName : `${stem} (${index})${extension}`);
    try { await access(candidate); }
    catch { return candidate; }
  }
  throw new Error('Could not create a unique download filename');
}

export async function downloadFromUrl(id: string, rawUrl: string, downloadsFolder: string, installFolder: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  const url = new URL(rawUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS download links are supported');
  const controller = new AbortController();
  activeDownloads.set(id, controller);
  let partialPath: string | null = null;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Plumbuddy/0.1 Sims Mod Manager' } });
    if (!response.ok) throw new Error(`The download server returned ${response.status}`);
    const finalUrl = new URL(response.url);
    const fileName = fileNameFromResponse(finalUrl, response.headers.get('content-disposition'));
    const extension = path.extname(fileName).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      throw new Error('This link did not return a supported Sims mod or archive. Try the creator’s direct download link.');
    }
    await mkdir(path.resolve(downloadsFolder), { recursive: true });
    partialPath = await availablePath(path.resolve(downloadsFolder), `${fileName}.part`);
    const handle = await open(partialPath, 'wx');
    let size = 0;
    try {
      if (!response.body) throw new Error('The download did not contain a file');
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        await handle.write(value);
      }
    } finally { await handle.close(); }
    const destination = directlyInstallable.has(extension) ? path.resolve(installFolder) : path.resolve(downloadsFolder);
    await mkdir(destination, { recursive: true });
    const finalPath = options.replaceExisting && directlyInstallable.has(extension) ? path.join(destination, fileName) : await availablePath(destination, fileName);
    if (options.replaceExisting && directlyInstallable.has(extension)) await rm(finalPath, { force: true });
    await rename(partialPath, finalPath);
    partialPath = null;
    if (extension === '.zip') {
      try {
        const extracted = await extractZipAndDelete(finalPath, installFolder, downloadsFolder, options);
        return { filePath: extracted.installedPaths[0], name: fileName, size, state: 'installed', extractedFiles: extracted.installedPaths.length, archiveDeleted: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'ZIP extraction failed';
        throw new Error(`${message}. The ZIP was kept at ${finalPath}`);
      }
    }
    return { filePath: finalPath, name: fileName, size, state: directlyInstallable.has(extension) ? 'installed' : 'downloaded' };
  } catch (error) {
    if (partialPath) await unlink(partialPath).catch(() => undefined);
    if (controller.signal.aborted) throw new Error('Download cancelled');
    throw error;
  } finally { activeDownloads.delete(id); }
}

export function cancelDownload(id: string) {
  activeDownloads.get(id)?.abort();
}
