import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Category, ModFile, ScanResult } from '../src/types.js';

const allowedExtensions = new Set(['.package', '.ts4script', '.cfg']);
const categoryKeywords: Array<[Category, string[]]> = [
  ['Script Mods', ['script', 'mc command', 'mccc', 'mc commander', 'wonderfulwhims', 'wickedwhims', 'ui cheats']],
  ['CAS', ['cas', 'female clothing', 'male clothing', 'clothing', 'shirt', 'tshirt', 'tee', 'top', 'hoodie', 'sweater', 'pants', 'jeans', 'skirt', 'short', 'shorts', 'legging', 'leggings', 'dress', 'shoe', 'shoes', 'sandal', 'sandals', 'pump', 'pumps', 'loafer', 'mule', 'mules', 'crocs', 'boot', 'boots', 'sneaker', 'nike', 'adidas', 'hair', 'makeup', 'skin', 'eyes', 'eyebrow', 'eyebrows', 'eyelash', 'eyelashes', 'lash', 'lashes', 'tattoo', 'contour', 'highlight', 'nail', 'nails', 'toenail', 'polish', 'preset', 'slider', 'heightslider', 'height slider', 'hat', 'cap', 'beanie', 'diadem', 'earring', 'necklace', 'ring', 'rings', 'bracelet', 'choker', 'glasses', 'headband', 'headphones', 'bow', 'scrunchie', 'pacifier', 'backpack', 'belt', 'tights', 'socks', 'accessory', 'accessories', 'joggers', 'vest', 'button up', 'blazer', 'coat', 'cardigan', 'jumpsuit', 'romper', 'bodysuit', 'bra', 'bralette', 'bikini', 'underwear', 'thong', 'panties', 'pajama', 'outfit', 'uniform', 'slacks', 'trench']],
  ['Build/Buy', ['buildbuy', 'build buy', 'build', 'buy', 'bed', 'dresser', 'sofa', 'couch', 'chair', 'table', 'kitchen', 'bathroom', 'wall', 'floor', 'window', 'door', 'rug', 'mirror', 'decor', 'clutter', 'ceiling', 'calendar', 'clock', 'poster', 'trash can', 'coffee machine', 'cutting board', 'dish rack', 'egg tray', 'glass cup', 'hot pot', 'column', 'corbel', 'arch', 'balcony', 'brick', 'bricks', 'molding', 'panel', 'staircase', 'railing', 'fence', 'skylight', 'roof', 'terrain', 'foundation', 'station', 'divider', 'car', 'cars', 'vehicle', 'boat', 'yacht', 'helicopter', 'porsche', 'mercedes', 'maybach', 'bmw', 'bugatti', 'tesla', 'toyota', 'audi', 'ferrari', 'rolls royce']],
  ['Gameplay', ['gameplay', 'career', 'trait', 'aspiration', 'tuning', 'mood', 'moodpack', 'errant thoughts', 'errantthoughts', 'adeepindigo', 'smallmods', 'food', 'delivery', 'recipe', 'cookbook', 'grannies cookbook', 'tianasims', 'candy store', 'meal', 'meals', 'breakfast', 'dessert', 'desserts', 'drink', 'drinks', 'appetiser', 'appetizer', 'snack', 'cake', 'cupcake', 'soup', 'pizza', 'pancake', 'smoothie', 'sandwich', 'pregnant', 'pregnancy', 'pose']],
  ['Overrides', ['override', 'replacement', 'default']],
];

const recommendedLocations: Array<[string, string[]]> = [
  ['Overrides', ['override', 'replacement', 'default']],
  ['Script Mods', ['script', 'mc command', 'mccc', 'wonderfulwhims', 'wickedwhims', 'ui cheats']],
  ['Gameplay', ['gameplay', 'career', 'trait', 'aspiration', 'tuning', 'moodpack', 'mood pack', 'lumpinou', 'errant thoughts', 'errantthoughts', 'adeepindigo', 'smallmods', 'delivery', 'food', 'recipe', 'cookbook', 'grannies cookbook', 'tianasims', 'candy store', 'meal', 'meals', 'breakfast', 'dessert', 'desserts', 'drink', 'drinks', 'appetiser', 'appetizer', 'snack', 'cake', 'cupcake', 'soup', 'pizza', 'pancake', 'smoothie', 'sandwich', 'pregnant', 'pregnancy', 'pose']],
  ['CAS\\Accessories', ['hat', 'hats', 'cap', 'beanie', 'diadem', 'earring', 'necklace', 'ring', 'rings', 'bracelet', 'choker', 'glasses', 'headband', 'headphones', 'bow', 'scrunchie', 'pacifier', 'backpack', 'belt', 'tights', 'socks', 'accessory', 'accessories']],
  ['CAS\\Clothes\\Tops', ['shirt', 'tshirt', 'tee', 'top', 'hoodie', 'sweater', 'blouse', 'jacket', 'crop', 'button up', 'vest', 'blazer', 'coat', 'cardigan', 'bustier', 'tank']],
  ['CAS\\Clothes\\Bottoms', ['pants', 'jeans', 'skirt', 'short', 'shorts', 'legging', 'leggings', 'joggers', 'slacks', 'bottom']],
  ['CAS\\Clothes\\Dresses', ['dress', 'gown', 'couple set', 'outfit', 'uniform', 'jumpsuit', 'romper', 'bodysuit', 'onesie']],
  ['CAS\\Clothes\\Shoes', ['shoe', 'shoes', 'boot', 'boots', 'heel', 'sneaker', 'sandal', 'sandals', 'pump', 'pumps', 'loafer', 'mule', 'mules', 'crocs', 'nike', 'adidas', 'wedges']],
  ['CAS\\Hair', ['hair', 'bangs', 'ponytail', 'braid']],
  ['CAS\\Makeup', ['makeup', 'lip', 'lipstick', 'eyeliner', 'liner', 'blush', 'shadow', 'tattoo', 'contour', 'highlight', 'nail', 'nails', 'toenail', 'polish']],
  ['CAS\\Genetics', ['skin', 'eyes', 'eye', 'eyebrow', 'eyebrows', 'eyelash', 'eyelashes', 'lash', 'lashes', 'preset', 'genetic', 'overlay', 'slider', 'heightslider', 'height slider']],
  ['BuildBuy\\Kitchen', ['kitchen', 'counter', 'stove', 'fridge', 'sink', 'cabinet', 'coffee machine', 'cutting board', 'dish rack', 'egg tray', 'glass cup', 'hot pot', 'pot']],
  ['BuildBuy\\Bedroom', ['bed', 'dresser', 'nightstand', 'wardrobe']],
  ['BuildBuy\\Bathroom', ['bathroom', 'toilet', 'shower', 'tub', 'bath']],
  ['BuildBuy\\Living Room', ['sofa', 'couch', 'tv', 'television', 'loveseat']],
  ['BuildBuy\\Dining Room', ['dining']],
  ['BuildBuy\\Office', ['desk', 'office', 'computer']],
  ['BuildBuy\\Outdoor', ['garden', 'outdoor', 'patio', 'pool', 'balcony', 'terrain', 'tree', 'trees', 'debug tree', 'pine', 'oak', 'beech', 'cypress', 'magnolia', 'mesquite', 'spruce', 'hawthorn', 'birch']],
  ['BuildBuy\\Decorations', ['clutter', 'decor', 'plant', 'lamp', 'light', 'neon', 'vase', 'candle', 'plate', 'bottle', 'perfume', 'soap', 'book', 'art', 'sculpture', 'flower', 'palm', 'jar', 'basket', 'shelf', 'sign', 'print', 'painting', 'ornament', 'prop', 'ceiling', 'calendar', 'clock', 'poster', 'trash can', 'box', 'eraser', 'markers', 'planner', 'ruler', 'pencil', 'car', 'cars', 'vehicle', 'boat', 'yacht', 'helicopter', 'porsche', 'mercedes', 'maybach', 'bmw', 'bugatti', 'tesla', 'toyota', 'audi', 'ferrari', 'rolls royce']],
  ['BuildBuy\\Build', ['build', 'wall', 'floor', 'window', 'door', 'foundation', 'roof', 'terrain', 'column', 'corbel', 'arch', 'brick', 'bricks', 'molding', 'panel', 'staircase', 'railing', 'fence', 'skylight']],
  ['BuildBuy\\Decorations', ['rug', 'mirror', 'chair', 'table']],
];

function categorize(value: string, extension: string): Category {
  if (extension === '.ts4script') return 'Script Mods';
  if (path.basename(value).toLowerCase() === 'resource.cfg') return 'Overrides';
  const organizedLocation = locationFromOrganizedFolder(value, extension);
  if (organizedLocation) return categoryFromLocation(organizedLocation, 'Uncategorized');
  const normalized = value.toLowerCase().replace(/[\\/_.()[\]-]/g, ' ');
  return categoryKeywords.find(([, keywords]) => keywords.some(word => normalized.includes(word)))?.[0] ?? 'Uncategorized';
}

function categoryFromLocation(location: string | null, fallback: Category): Category {
  if (!location) return fallback;
  if (location.startsWith('CAS\\')) return 'CAS';
  if (location.startsWith('BuildBuy\\')) return 'Build/Buy';
  return location as Category;
}

function locationFromOrganizedFolder(relativePath: string, extension: string) {
  if (extension === '.ts4script') return 'Script Mods';
  const parts = path.dirname(relativePath).replace(/\//g, '\\').split('\\').filter(Boolean);
  const lower = parts.map(part => part.toLowerCase());
  if (!lower.length) return null;
  if (lower[0] === 'cas') {
    if (lower.includes('hair')) return 'CAS\\Hair';
    if (lower.includes('makeup')) return 'CAS\\Makeup';
    if (lower.includes('genetics')) return 'CAS\\Genetics';
    if (lower.includes('accessories')) return 'CAS\\Accessories';
    if (lower.includes('shoes')) return 'CAS\\Clothes\\Shoes';
    if (lower.includes('bottoms')) return 'CAS\\Clothes\\Bottoms';
    if (lower.includes('dresses')) return 'CAS\\Clothes\\Dresses';
    if (lower.includes('tops')) return 'CAS\\Clothes\\Tops';
    if (lower.includes('clothes')) return 'CAS\\Clothes\\Dresses';
    return 'CAS\\Accessories';
  }
  if (lower[0] === 'buildbuy' || lower[0] === 'build buy') {
    if (lower.includes('kitchen')) return 'BuildBuy\\Kitchen';
    if (lower.includes('bedroom')) return 'BuildBuy\\Bedroom';
    if (lower.includes('bathroom')) return 'BuildBuy\\Bathroom';
    if (lower.includes('living room') || lower.includes('living')) return 'BuildBuy\\Living Room';
    if (lower.includes('dining room') || lower.includes('dining')) return 'BuildBuy\\Dining Room';
    if (lower.includes('office')) return 'BuildBuy\\Office';
    if (lower.includes('outdoor')) return 'BuildBuy\\Outdoor';
    if (lower.includes('build')) return 'BuildBuy\\Build';
    if (lower.includes('decorations') || lower.includes('decor')) return 'BuildBuy\\Decorations';
    return 'BuildBuy\\Decorations';
  }
  if (lower[0] === 'gameplay') return 'Gameplay';
  if (lower[0] === 'script mods') return 'Script Mods';
  if (lower[0] === 'overrides') return 'Overrides';
  return null;
}

function recommendLocation(relativePath: string, extension: string) {
  if (extension === '.ts4script') return 'Script Mods';
  if (path.basename(relativePath).toLowerCase() === 'resource.cfg') return null;
  const organizedLocation = locationFromOrganizedFolder(relativePath, extension);
  if (organizedLocation) return organizedLocation;
  const folder = path.dirname(relativePath).replace(/\//g, '\\').toLowerCase();
  const filename = path.basename(relativePath).toLowerCase().replace(/[\\/_.()[\]-]/g, ' ');
  const relativeNormalized = relativePath.toLowerCase().replace(/[\\/_.()[\]-]/g, ' ');
  const fileKeywordLocation = recommendedLocations.find(([, keywords]) => keywords.some(word => filename.includes(word)))?.[0] ?? null;
  if (fileKeywordLocation) return fileKeywordLocation;

  const pathKeywordLocation = recommendedLocations.find(([, keywords]) => keywords.some(word => relativeNormalized.includes(word)))?.[0] ?? null;
  if (pathKeywordLocation && !['female clothing', 'male clothing', 'new girl stuff', 'old cc', 'misc cc', 'g drive cc', "rudy's cc", 'whitney mods'].some(name => folder === name || folder.startsWith(`${name}\\`))) {
    return pathKeywordLocation;
  }
  if (folder.startsWith('buildbuy\\bathroom')) return 'BuildBuy\\Bathroom';
  if (folder.startsWith('buildbuy\\bedroom')) return 'BuildBuy\\Bedroom';
  if (folder.startsWith('buildbuy\\kitchen')) return 'BuildBuy\\Kitchen';
  if (folder.startsWith('buildbuy\\living room')) return 'BuildBuy\\Living Room';
  if (folder.startsWith('buildbuy\\dining room')) return 'BuildBuy\\Dining Room';
  if (folder.startsWith('buildbuy\\office')) return 'BuildBuy\\Office';
  if (folder.startsWith('buildbuy\\outdoor')) return 'BuildBuy\\Outdoor';
  if (folder.startsWith('buildbuy\\build') || folder === 'build' || folder.startsWith('build\\')) return 'BuildBuy\\Build';
  if (folder.startsWith('buildbuy\\decorations')) return 'BuildBuy\\Decorations';
  if (folder === 'cars' || folder.startsWith('cars\\')) return 'BuildBuy\\Decorations';
  if (folder === 'furniture' || folder.startsWith('furniture\\')) return 'BuildBuy\\Decorations';
  if (folder === 'k hippie' || folder.startsWith('k hippie\\')) return 'BuildBuy\\Outdoor';
  if (folder.startsWith('cas\\clothes\\tops')) return 'CAS\\Clothes\\Tops';
  if (folder.startsWith('cas\\clothes\\bottoms')) return 'CAS\\Clothes\\Bottoms';
  if (folder.startsWith('cas\\clothes\\dresses')) return 'CAS\\Clothes\\Dresses';
  if (folder.startsWith('cas\\clothes\\shoes')) return 'CAS\\Clothes\\Shoes';
  if (folder.startsWith('cas\\hair')) return 'CAS\\Hair';
  if (folder.startsWith('cas\\makeup')) return 'CAS\\Makeup';
  if (folder.startsWith('cas\\genetics')) return 'CAS\\Genetics';
  if (folder.startsWith('cas\\accessories')) return 'CAS\\Accessories';
  if (folder === 'cas' || folder.startsWith('cas\\')) return 'CAS\\Accessories';
  if (folder === 'male clothing' || folder.startsWith('male clothing\\')) return 'CAS\\Clothes\\Dresses';
  if (folder === 'new girl stuff' || folder.startsWith('new girl stuff\\')) return 'CAS\\Clothes\\Dresses';
  return null;
}

function isInRecommendedFolder(relativePath: string, recommendedLocation: string, extension: string) {
  const currentFolder = path.dirname(relativePath);
  if (currentFolder === '.') return false;
  const normalizedCurrent = currentFolder.replace(/\//g, '\\').toLowerCase();
  const normalizedRecommended = recommendedLocation.toLowerCase();
  if (extension === '.ts4script') return normalizedCurrent === normalizedRecommended;
  return normalizedCurrent === normalizedRecommended || normalizedCurrent.startsWith(`${normalizedRecommended}\\`);
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

function scanCacheKey(filePath: string) {
  return path.resolve(filePath).toLowerCase();
}

export async function scanMods(root: string, previous?: ScanResult | null): Promise<ScanResult> {
  const absoluteRoot = path.resolve(root);
  const files: ModFile[] = [];
  const previousByPath = new Map((previous?.files ?? []).map(file => [scanCacheKey(file.path), file]));
  const previousByRelativePath = new Map((previous?.files ?? []).map(file => [file.relativePath.toLowerCase(), file]));
  const pendingHashes: Array<{ file: ModFile; fullPath: string }> = [];

  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else {
        const extension = path.extname(entry.name).toLowerCase();
        if (!allowedExtensions.has(extension)) continue;
        const info = await stat(fullPath);
        const relativePath = path.relative(absoluteRoot, fullPath);
        const folderDepth = relativePath.split(path.sep).length - 1;
        const recommendedLocation = recommendLocation(relativePath, extension);
        const fallbackCategory = categorize(relativePath, extension);
        const modifiedAt = info.mtime.toISOString();
        const previousFile = previousByPath.get(scanCacheKey(fullPath)) ?? previousByRelativePath.get(relativePath.toLowerCase());
        const hash = previousFile && previousFile.size === info.size && previousFile.modifiedAt === modifiedAt ? previousFile.hash : '';
        const file: ModFile = {
          id: randomUUID(), name: entry.name, path: fullPath, relativePath, extension,
          size: info.size, modifiedAt, hash,
          category: categoryFromLocation(recommendedLocation, fallbackCategory),
          recommendedLocation,
          categoryMismatch: Boolean(recommendedLocation && !isInRecommendedFolder(relativePath, recommendedLocation, extension)),
          enabled: true, duplicate: false,
          depthIssue: extension === '.ts4script' && folderDepth > 1,
        };
        files.push(file);
        if (!hash) pendingHashes.push({ file, fullPath });
      }
    }
  }
  await walk(absoluteRoot);
  let cursor = 0;
  const workerCount = Math.min(3, Math.max(1, pendingHashes.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < pendingHashes.length) {
      const task = pendingHashes[cursor++];
      task.file.hash = await hashFile(task.fullPath);
    }
  }));
  const byHash = new Map<string, ModFile[]>();
  for (const file of files) {
    if (file.name.toLowerCase() === 'resource.cfg') continue;
    byHash.set(file.hash, [...(byHash.get(file.hash) ?? []), file]);
  }
  const duplicateGroups = [...byHash.values()].filter(group => group.length > 1);
  duplicateGroups.forEach(group => group.forEach(file => { file.duplicate = true; }));
  return {
    files, totalSize: files.reduce((sum, file) => sum + file.size, 0),
    duplicateGroups: duplicateGroups.length,
    depthIssues: files.filter(file => file.depthIssue).length,
    uncategorized: files.filter(file => file.category === 'Uncategorized').length,
    scannedAt: new Date().toISOString(),
  };
}
