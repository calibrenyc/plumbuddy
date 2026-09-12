export const organizedLocations = [
  'Gameplay', 'CAS\\Clothes\\Tops', 'CAS\\Clothes\\Bottoms', 'CAS\\Clothes\\Dresses',
  'CAS\\Clothes\\Shoes', 'CAS\\Hair', 'CAS\\Makeup', 'CAS\\Genetics', 'BuildBuy\\Kitchen',
  'BuildBuy\\Bedroom', 'BuildBuy\\Bathroom', 'BuildBuy\\Living Room', 'BuildBuy\\Dining Room',
  'BuildBuy\\Office', 'BuildBuy\\Outdoor', 'BuildBuy\\Decorations', 'BuildBuy\\Build', 'Script Mods', 'Overrides', 'Uncategorized',
] as const;

export function categoryLabel(value: string) {
  return value.replace(/\\/g, ' > ');
}
