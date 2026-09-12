import { app } from 'electron';
import type { AppUpdateInfo } from '../src/types.js';

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
