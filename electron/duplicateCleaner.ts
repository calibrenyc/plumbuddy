import { shell } from 'electron';
import { lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { DuplicateDeleteResult } from '../src/types.js';

const runFile = promisify(execFile);
const allowedExtensions = new Set(['.package', '.ts4script', '.cfg']);

async function simsIsRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await runFile('tasklist.exe', ['/FI', 'IMAGENAME eq TS4*.exe', '/FO', 'CSV', '/NH'], { windowsHide: true });
    return /TS4(?:_DX9)?_x64\.exe/i.test(stdout);
  } catch {
    return false;
  }
}

function isInsideRoot(filePath: string, modsRoot: string) {
  const source = path.resolve(filePath);
  const root = path.resolve(modsRoot);
  return source === root || source.startsWith(`${root}${path.sep}`);
}

async function trashOne(filePath: string, modsRoot: string) {
  const source = path.resolve(filePath);
  if (!isInsideRoot(source, modsRoot)) throw new Error('This file is outside the selected Mods folder');
  if (!allowedExtensions.has(path.extname(source).toLowerCase())) throw new Error('Only supported Sims mod files can be removed');

  const info = await lstat(source);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('The selected file is not a regular mod file');

  await shell.trashItem(source);
  return source;
}

export async function trashDuplicateFiles(filePaths: string[], modsRoot: string): Promise<DuplicateDeleteResult> {
  if (await simsIsRunning()) throw new Error('Close The Sims 4 before removing duplicate files');

  const deleted: string[] = [];
  const errors: DuplicateDeleteResult['errors'] = [];
  const uniquePaths = [...new Set(filePaths.map(filePath => path.resolve(filePath)))];

  for (const filePath of uniquePaths) {
    try {
      deleted.push(await trashOne(filePath, modsRoot));
    } catch (error) {
      errors.push({ filePath, message: error instanceof Error ? error.message : 'The duplicate could not be moved to the Recycle Bin' });
    }
  }

  return { deleted, errors };
}
