export function recommendLocation(value: string) {
  const text = value.toLowerCase().replace(/[_\-.]/g, ' ');
  const rules: Array<[string, string[]]> = [
    ['CAS\\Clothes\\Tops', ['shirt', 'top', 'hoodie', 'sweater', 'jacket', 'blouse']],
    ['CAS\\Clothes\\Bottoms', ['pants', 'jeans', 'shorts', 'skirt', 'leggings']],
    ['CAS\\Clothes\\Dresses', ['dress', 'gown']],
    ['CAS\\Clothes\\Shoes', ['shoe', 'boots', 'heels', 'sneakers']],
    ['CAS\\Hair', ['hair', 'braids', 'locs', 'ponytail']],
    ['CAS\\Makeup', ['lipstick', 'eyeliner', 'eyeshadow', 'blush', 'makeup']],
    ['CAS\\Genetics', ['skin', 'eyes', 'eyebrows', 'preset']],
    ['BuildBuy\\Kitchen', ['counter', 'cabinet', 'stove', 'fridge', 'kitchen']],
    ['BuildBuy\\Bedroom', ['bed', 'dresser', 'nightstand', 'wardrobe']],
    ['BuildBuy\\Bathroom', ['toilet', 'shower', 'bathtub', 'bathroom']],
    ['BuildBuy\\Living Room', ['sofa', 'couch', 'coffee table', 'television']],
    ['BuildBuy\\Office', ['desk', 'computer', 'bookshelf']],
    ['BuildBuy\\Decorations', ['painting', 'plant', 'rug', 'mirror', 'decor']],
    ['BuildBuy\\Build', ['wallpaper', 'floor', 'foundation', 'roof', 'window', 'door']],
    ['Script Mods', ['script', 'mccc', 'whims', 'gameplay']],
  ];
  return rules.find(([, words]) => words.some(word => text.includes(word)))?.[0] ?? 'Uncategorized';
}
