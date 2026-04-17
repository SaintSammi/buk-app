export type Book = {
  id: string;
  title: string;
  author: string;
  coverUri?: string;
  fileUri?: string;
  sourceType?: 'pdf' | 'epub' | 'txt' | 'other';
  series?: string;
  publisher?: string;
  description?: string;
  assetModule?: number | any; // Used for bundling local static assets
};

export const DEFAULT_COVER_URI = 'https://covers.openlibrary.org/b/id/8231856-L.jpg';

export const defaultBooks: Book[] = [
  {
    id: 'pre-1',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    sourceType: 'epub',
    assetModule: require('../assets/pre-packaged epub/austen-pride-and-prejudice-illustrations.epub'),
    coverUri: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
  },
  {
    id: 'pre-2',
    title: 'Fantastic Fables',
    author: 'Ambrose Bierce',
    sourceType: 'epub',
    assetModule: require('../assets/pre-packaged epub/bierce-fantastic-fables.epub'),
    coverUri: 'https://covers.openlibrary.org/b/id/8225631-L.jpg',
  },
  {
    id: 'pre-3',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    sourceType: 'epub',
    assetModule: require('../assets/pre-packaged epub/fitzgerald-great-gatsby.epub'),
    coverUri: 'https://covers.openlibrary.org/b/id/7222246-L.jpg',
  },
  {
    id: 'pre-4',
    title: 'The Bell Jar',
    author: 'Sylvia Plath',
    sourceType: 'epub',
    assetModule: require('../assets/pre-packaged epub/plath-bell-jar.epub'),
    coverUri: 'https://covers.openlibrary.org/b/id/5551656-L.jpg',
  },
  {
    id: 'pre-5',
    title: 'Of Mice and Men',
    author: 'John Steinbeck',
    sourceType: 'epub',
    assetModule: require('../assets/pre-packaged epub/steinbeck-of-mice-and-men.epub'),
    coverUri: 'https://covers.openlibrary.org/b/id/8228691-L.jpg',
  },
];

export function isPdfAsset(asset: { name?: string; mimeType?: string; type?: string } | undefined) {
  const name = asset?.name?.toLowerCase() ?? '';
  const mimeType = asset?.mimeType ?? asset?.type ?? '';
  const uri = (asset as any)?.uri?.toLowerCase?.() ?? '';
  return name.endsWith('.pdf') || String(mimeType).toLowerCase().includes('pdf') || uri.includes('.pdf');
}

export function isEpubAsset(asset: { name?: string; mimeType?: string; type?: string } | undefined) {
  const name = asset?.name?.toLowerCase() ?? '';
  const mimeType = String(asset?.mimeType ?? asset?.type ?? '').toLowerCase();
  const uri = (asset as any)?.uri?.toLowerCase?.() ?? '';
  return name.endsWith('.epub') || mimeType.includes('epub') || uri.includes('.epub');
}

export function isTxtAsset(asset: { name?: string; mimeType?: string; type?: string } | undefined) {
  const name = asset?.name?.toLowerCase() ?? '';
  const mimeType = String(asset?.mimeType ?? asset?.type ?? '').toLowerCase();
  const uri = (asset as any)?.uri?.toLowerCase?.() ?? '';
  return name.endsWith('.txt') || mimeType === 'text/plain' || uri.includes('.txt');
}

export function cleanFileNameToTitle(fileName: string) {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
