/**
 * Curated Unsplash travel photo IDs organized by visual category.
 * Using direct images.unsplash.com URLs (verified 200 status).
 * Each destination gets a consistent photo based on a hash of its name + type.
 *
 * Shared across destination cards, hub heroes, nearby sections, etc.
 */
export const CURATED_PHOTOS: Record<string, string[]> = {
  beach: [
    'photo-1507525428034-b723cf961d3e',
    'photo-1506929562872-bb421503ef21',
    'photo-1520454974749-611b7248ffdb',
    'photo-1473116763249-2faaef81ccda',
    'photo-1510414842594-a61c69b5ae57',
    'photo-1519046904884-53103b34b206',
    'photo-1471922694854-ff1b63b20054',
    'photo-1505228395891-9a51e7e86bf6',
  ],
  city: [
    'photo-1477959858617-67f85cf4f1df',
    'photo-1480714378408-67cf0d13bc1b',
    'photo-1514565131-fce0801e5785',
    'photo-1449824913935-59a10b8d2000',
    'photo-1519501025264-65ba15a82390',
    'photo-1502602898657-3e91760cbb34',
    'photo-1493976040374-85c8e12f0c0e',
    'photo-1499856871958-5b9627545d1a',
    'photo-1534430480872-3498386e7856',
    'photo-1444723121867-7a241cacace9',
  ],
  island: [
    'photo-1559128010-7c1ad6e1b6a5',
    'photo-1544735716-392fe2489ffa',
    'photo-1590523277543-a94d2e4eb00b',
    'photo-1514282401047-d79a71a590e8',
    'photo-1516815231560-8f41ec531527',
    'photo-1548574505-5e239809ee19',
    'photo-1573790387438-4da905039392',
    'photo-1537956965359-7573183d1f57',
  ],
  mountain: [
    'photo-1464822759023-fed622ff2c3b',
    'photo-1501785888041-af3ef285b470',
    'photo-1476514525535-07fb3b4ae5f1',
    'photo-1504280390367-361c6d9f38f4',
    'photo-1512100356356-de1b84283e18',
    'photo-1552733407-5d5c46c3bb3b',
    'photo-1506905925346-21bda4d32df4',
    'photo-1519681393784-d120267933ba',
  ],
  cruise: [
    'photo-1548574505-5e239809ee19',
    'photo-1530521954074-e64f6810b32d',
    'photo-1505118380757-91f5f5632de0',
    'photo-1473116763249-2faaef81ccda',
    'photo-1580541631950-7282082b53ce',
    'photo-1559827260-dc66d52bef19',
    'photo-1544551763-46a013bb70d5',
    'photo-1507400492013-162706c8c05e',
  ],
  tropical: [
    'photo-1520250497591-112f2f40a3f4',
    'photo-1528702748617-c64d49f918af',
    'photo-1547471080-7cc2caa01a7e',
    'photo-1530789253388-582c481c54b0',
    'photo-1571003123894-1f0594d2b5d9',
    'photo-1540202404-a2f29016b523',
    'photo-1510414842594-a61c69b5ae57',
    'photo-1506665531195-3566af2b4dfa',
  ],
  region: [
    'photo-1500835556837-99ac94a94552',
    'photo-1501785888041-af3ef285b470',
    'photo-1476900164809-ff19b8ae5968',
    'photo-1464822759023-fed622ff2c3b',
    'photo-1469854523086-cc02fe5d8800',
    'photo-1518548419970-58e3b4079ab2',
    'photo-1539037116277-4db20889f2d7',
    'photo-1506905925346-21bda4d32df4',
  ],
  default: [
    'photo-1500835556837-99ac94a94552',
    'photo-1469854523086-cc02fe5d8800',
    'photo-1476900164809-ff19b8ae5968',
    'photo-1530789253388-582c481c54b0',
    'photo-1518548419970-58e3b4079ab2',
    'photo-1539037116277-4db20889f2d7',
    'photo-1542314831-068cd1dbfeeb',
    'photo-1473186505569-9c61870c11f9',
  ],
}

/** Map destinationType to curated photo category */
export const TYPE_TO_CATEGORY: Record<string, string> = {
  port_city: 'cruise',
  island: 'island',
  resort_area: 'tropical',
  city: 'city',
  country: 'default',
  region: 'region',
}

/**
 * Pick a curated Unsplash image based on destination name + type.
 * Deterministic: the same name always returns the same photo.
 *
 * @param name - Entity name used for deterministic hash
 * @param type - destinationType or category string (e.g. 'city', 'island', 'region')
 * @param size - Image dimensions: 'card' (600x400) or 'hero' (1600x900)
 */
export function getCuratedImage(
  name: string,
  type?: string,
  size: 'card' | 'hero' = 'card',
): string {
  const category = TYPE_TO_CATEGORY[type || ''] || (type && CURATED_PHOTOS[type] ? type : 'default')
  const photos = CURATED_PHOTOS[category] ?? CURATED_PHOTOS.default!
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const photoId = photos[hash % photos.length] ?? photos[0]!
  const dimensions = size === 'hero' ? 'w=1600&h=900' : 'w=600&h=400'
  return `https://images.unsplash.com/${photoId}?${dimensions}&fit=crop&auto=format&q=75`
}
