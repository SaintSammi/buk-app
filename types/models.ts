export type Book = {
  id: string;
  title: string;
  author: string;
  coverUri?: string;
  fileUri?: string;
  sourceType?: 'pdf' | 'epub' | 'txt' | 'other';
};

export const DEFAULT_COVER_URI = 'https://covers.openlibrary.org/b/id/8231856-L.jpg';

export const defaultBooks: Book[] = [
  {
    id: '1',
    title: 'Pride and Prejudices',
    author: 'Jane Austen',
    coverUri: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
  },
  {
    id: '2',
    title: "Alice's Adventures in Wonderland",
    author: 'Lewis Carroll',
    coverUri: 'https://covers.openlibrary.org/b/id/8225631-L.jpg',
  },
  {
    id: '3',
    title: 'Frankenstein',
    author: 'Mary Shelley',
    coverUri: 'https://covers.openlibrary.org/b/id/7222246-L.jpg',
  },
  {
    id: '4',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    coverUri: 'https://covers.openlibrary.org/b/id/5551656-L.jpg',
  },
  {
    id: '5',
    title: 'The Adventures of Sherlock Holmes',
    author: 'Sir Arthur Conan Doyle',
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
