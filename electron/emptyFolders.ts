import { shell } from 'electron';
import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';

export interface EmptyFolderCleanupResult {
  removed: string[];
  errors: Array<{ folderPath: string; message: string }>;
}

function isInsideRoot(folderPath: string, modsRoot: string) {
  const target = path.resolve(folderPath);
  const root = path.resolve(modsRoot);
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function isProtectedFolder(folderPath: string, modsRoot: string) {
  const relative = path.relative(path.resolve(modsRoot), path.resolve(folderPath)).replace(/\//g, '\\').toLowerCase();
  return relative === 'uncategorized';
}

export async function findEmptyFolders(modsRoot: string): Promise<string[]> {
  const root = path.resolve(modsRoot);
  const emptyFolders: string[] = [];

  async function walk(directory: string): Promise<boolean> {
    const entries = await readdir(directory, { withFileTypes: true });
    let hasContent = false;

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const childEmpty = await walk(fullPath);
        if (!childEmpty) hasContent = true;
      } else {
        hasContent = true;
      }
    }

    const isEmpty = !hasContent;
    if (isEmpty && directory !== root && !isProtectedFolder(directory, root)) emptyFolders.push(directory);
    return isEmpty;
  }

  await walk(root);
  return emptyFolders.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export async function removeEmptyFolders(folderPaths: string[], modsRoot: string): Promise<EmptyFolderCleanupResult> {
  const removed: string[] = [];
  const errors: EmptyFolderCleanupResult['errors'] = [];
  const uniqueFolders = [...new Set(folderPaths.map(folderPath => path.resolve(folderPath)))].sort((a, b) => b.length - a.length);

  for (const folderPath of uniqueFolders) {
    try {
      if (!isInsideRoot(folderPath, modsRoot)) throw new Error('This folder is outside the selected Mods folder');
      if (isProtectedFolder(folderPath, modsRoot)) throw new Error('The Uncategorized folder is protected');
      const info = await lstat(folderPath);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('The selected path is not a regular folder');
      const entries = await readdir(folderPath);
      if (entries.length > 0) throw new Error('Folder is no longer empty');
      await shell.trashItem(folderPath);
      removed.push(folderPath);
    } catch (error) {
      errors.push({ folderPath, message: error instanceof Error ? error.message : 'The folder could not be removed' });
    }
  }

  return { removed, errors };
}
