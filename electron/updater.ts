import { app } from 'electron';
import { createWriteStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { AppUpdateInfo, AppUpdateInstallResult } from '../src/types.js';

const repository = 'calibrenyc/plumbuddy';

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  assets?: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string) {
  const a = normalizeVersion(left).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const b = normalizeVersion(right).split(/[.-]/).map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return 1;
    if ((a[index] ?? 0) < (b[index] ?? 0)) return -1;
  }
  return 0;
}

export async function checkAppUpdates(): Promise<AppUpdateInfo> {
  const currentVersion = app.getVersion();
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Plumbuddy/${currentVersion}`,
    },
  });
  if (response.status === 404) {
    throw new Error('No GitHub release has been published yet. Build a portable, create a release, and attach the EXE.');
  }
  if (!response.ok) throw new Error(`GitHub update check failed: ${response.status}`);
  const release = await response.json() as GitHubRelease;
  const latestVersion = normalizeVersion(release.tag_name || currentVersion);
  const asset = release.assets?.find(item => /portable.*x64.*\.exe$/i.test(item.name) || /\.exe$/i.test(item.name)) ?? null;
  return {
    currentVersion,
    latestVersion,
    updateAvailable: compareVersions(currentVersion, latestVersion) < 0,
    releaseName: release.name || `v${latestVersion}`,
    releaseNotes: release.body || '',
    releaseUrl: release.html_url || `https://github.com/${repository}/releases/latest`,
    downloadUrl: asset?.browser_download_url ?? null,
    assetName: asset?.name ?? null,
    publishedAt: release.published_at ?? null,
  };
}

function portableExecutablePath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function powershellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function downloadUpdateAsset(update: AppUpdateInfo) {
  if (!update.downloadUrl || !update.assetName) throw new Error('This release does not have a portable EXE attached yet.');
  const updatesRoot = path.join(app.getPath('userData'), 'updates');
  await mkdir(updatesRoot, { recursive: true });
  const fileName = path.basename(update.assetName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  if (!/\.exe$/i.test(fileName)) throw new Error('The release asset is not a Windows EXE.');
  const stagedPath = path.join(updatesRoot, `${Date.now()}-${fileName}`);
  const response = await fetch(update.downloadUrl, {
    redirect: 'follow',
    headers: {
      Accept: 'application/octet-stream,*/*',
      'User-Agent': `Plumbuddy/${app.getVersion()}`,
    },
  });
  if (!response.ok || !response.body) throw new Error(`Could not download update: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>), createWriteStream(stagedPath, { flags: 'wx' }));
  return stagedPath;
}

export async function downloadAndInstallAppUpdate(update: AppUpdateInfo): Promise<AppUpdateInstallResult> {
  if (!update.updateAvailable) throw new Error('Plumbuddy is already up to date.');
  const currentExe = portableExecutablePath();
  const stagedPath = await downloadUpdateAsset(update);
  await access(stagedPath);

  const scriptPath = path.join(app.getPath('userData'), 'updates', `apply-update-${Date.now()}.ps1`);
  const backupPath = `${currentExe}.old-${Date.now()}`;
  const logPath = path.join(app.getPath('userData'), 'updates', 'last-update.log');
  const pid = process.pid;
  const script = `
$ErrorActionPreference = "Stop"
$current = ${powershellLiteral(currentExe)}
$next = ${powershellLiteral(stagedPath)}
$backup = ${powershellLiteral(backupPath)}
$log = ${powershellLiteral(logPath)}
Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Updater started. Current=$current Next=$next"
Start-Sleep -Milliseconds 800
try {
  Wait-Process -Id ${pid} -Timeout 45 -ErrorAction SilentlyContinue
} catch {}
Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) App process released or timed out."
for ($i = 0; $i -lt 60; $i++) {
  try {
    if (Test-Path -LiteralPath $current) {
      Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Moving old EXE to backup."
      Move-Item -LiteralPath $current -Destination $backup -Force
    }
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Moving staged EXE into place."
    Move-Item -LiteralPath $next -Destination $current -Force
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Starting updated EXE."
    Start-Process -FilePath $current -WorkingDirectory (Split-Path -Parent $current)
    if (Test-Path -LiteralPath $backup) {
      Start-Sleep -Seconds 2
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Updated Plumbuddy to ${update.latestVersion}"
    exit 0
  } catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Attempt $i failed: $($_.Exception.Message)"
    Start-Sleep -Seconds 1
  }
}
Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) Update failed: $($_.Exception.Message)"
Start-Process -FilePath $next -WorkingDirectory (Split-Path -Parent $next)
exit 1
`.trim();
  await writeFile(scriptPath, script, 'utf8');

  const launcher = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  launcher.unref();
  setTimeout(() => app.exit(0), 650);
  return { stagedPath, message: 'Update downloaded. Plumbuddy will close, replace the old EXE, and restart.' };
}
