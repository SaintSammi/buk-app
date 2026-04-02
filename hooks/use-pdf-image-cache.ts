import { useCallback, useMemo, useState } from 'react';

type PageImageEntry = {
  page: number;
  uri: string;
  updatedAt: number;
  touchedAt: number;
};

type PrimeWindowOptions = {
  currentPage: number;
  totalPages: number;
  radius?: number;
  direction?: 'left' | 'right' | 'none';
};

type UsePdfImageCacheOptions = {
  maxEntries: number;
};

export function usePdfImageCache(options: UsePdfImageCacheOptions) {
  const { maxEntries } = options;
  const [entries, setEntries] = useState<Record<number, PageImageEntry>>({});

  const touch = useCallback((page: number) => {
    setEntries((prev) => {
      const existing = prev[page];
      if (!existing) return prev;
      return {
        ...prev,
        [page]: {
          ...existing,
          touchedAt: Date.now(),
        },
      };
    });
  }, []);

  const setPageImage = useCallback(
    (page: number, uri: string) => {
      if (!page || !uri) return;

      setEntries((prev) => {
        const next: Record<number, PageImageEntry> = {
          ...prev,
          [page]: {
            page,
            uri,
            updatedAt: Date.now(),
            touchedAt: Date.now(),
          },
        };

        const pages = Object.keys(next)
          .map((key) => Number.parseInt(key, 10))
          .filter((value) => Number.isFinite(value));

        if (pages.length <= maxEntries) {
          return next;
        }

        const orderedByLeastRecent = pages
          .map((value) => next[value])
          .filter(Boolean)
          .sort((a, b) => a.touchedAt - b.touchedAt);

        const removeCount = pages.length - maxEntries;
        for (let i = 0; i < removeCount; i += 1) {
          const candidate = orderedByLeastRecent[i];
          if (candidate) {
            delete next[candidate.page];
          }
        }

        return next;
      });
    },
    [maxEntries]
  );

  const clear = useCallback(() => {
    setEntries({});
  }, []);

  const removePage = useCallback((page: number) => {
    setEntries((prev) => {
      if (!prev[page]) return prev;
      const next = { ...prev };
      delete next[page];
      return next;
    });
  }, []);

  const getPageImage = useCallback(
    (page: number) => {
      const entry = entries[page];
      if (!entry) return null;
      return entry.uri;
    },
    [entries]
  );

  const primeWindow = useCallback(
    ({ currentPage, totalPages, radius = 1, direction = 'none' }: PrimeWindowOptions) => {
      if (totalPages <= 0 || currentPage <= 0) return [] as number[];

      const targets = new Set<number>();
      targets.add(currentPage);

      for (let i = 1; i <= radius; i += 1) {
        const prevPage = currentPage - i;
        const nextPage = currentPage + i;

        if (prevPage >= 1) targets.add(prevPage);
        if (nextPage <= totalPages) targets.add(nextPage);
      }

      if (direction === 'left' && currentPage + radius + 1 <= totalPages) {
        targets.add(currentPage + radius + 1);
      }

      if (direction === 'right' && currentPage - radius - 1 >= 1) {
        targets.add(currentPage - radius - 1);
      }

      const missing = Array.from(targets).filter((page) => !entries[page]);
      return missing.sort((a, b) => a - b);
    },
    [entries]
  );

  const cachedPages = useMemo(
    () =>
      Object.keys(entries)
        .map((key) => Number.parseInt(key, 10))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b),
    [entries]
  );

  return {
    cachedPages,
    clear,
    entries,
    getPageImage,
    primeWindow,
    removePage,
    setPageImage,
    touch,
  };
}
