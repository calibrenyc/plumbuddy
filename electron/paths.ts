import { app } from 'electron';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function exists(candidate: string) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function detectDefaultPaths() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Documents', 'Electronic Arts', 'The Sims 4', 'Mods'),
    path.join(home, 'OneDrive', 'Documents', 'Electronic Arts', 'The Sims 4', 'Mods'),
  ];
  const detected = (await Promise.all(candidates.map(async p => ({ p, ok: await exists(p) })))).find(x => x.ok)?.p;
  const documents = app.getPath('documents');
  const dataRoot = path.join(documents, 'Plumbuddy');
  return {
    modsFolder: detected ?? path.join(documents, 'Electronic Arts', 'The Sims 4', 'Mods'),
    packStorage: path.join(dataRoot, 'Mod Packs'),
    backupStorage: path.join(dataRoot, 'Backups'),
    downloadsFolder: path.join(dataRoot, 'Downloads'),
    appInstallFolder: path.join(dataRoot, 'Application'),
  };
}

export async function ensureDirectory(directory: string) {
  await mkdir(path.resolve(directory), { recursive: true });
}
