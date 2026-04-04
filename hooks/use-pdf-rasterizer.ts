import { PixelRatio } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { usePdfImageCache } from './use-pdf-image-cache';
import {
  disposePdfDocument,
  isPdfPageImageExtractorAvailable,
  preparePdfDocument,
  renderPdfPageToImage,
} from '@/services/pdf-page-image-extractor';

type DragDirection = 'none' | 'left' | 'right';

export function usePdfRasterizer({
  activePdfUri,
  screenWidthRef,
  currentPage,
  totalPages,
  dragDirection,
}: {
  activePdfUri: string;
  screenWidthRef: { current: number };
  currentPage: number;
  totalPages: number;
  dragDirection: DragDirection;
}) {
  const [extractorReady, setExtractorReady] = useState(false);
  const [extractorBusy, setExtractorBusy] = useState(false);
  const [extractorDocumentId, setExtractorDocumentId] = useState('');
  const [pageCount, setPageCount] = useState<number | null>(null);

  // Ref tracks the live document ID for cleanup — avoids loop from including
  // extractorDocumentId state in the setup effect deps.
  const extractorDocumentIdRef = useRef('');
  const extractorQueueRef = useRef<number[]>([]);
  const extractorInFlightPageRef = useRef<number | null>(null);

  const { getPageImage, primeWindow, setPageImage, touch, clear: clearCache } = usePdfImageCache({ maxEntries: 14 });

  // Reset when file changes
  useEffect(() => {
    setExtractorReady(false);
    setExtractorBusy(false);
    setExtractorDocumentId('');
    setPageCount(null);
    if (extractorDocumentIdRef.current) {
      disposePdfDocument(extractorDocumentIdRef.current);
      extractorDocumentIdRef.current = '';
    }
    extractorQueueRef.current = [];
    extractorInFlightPageRef.current = null;
    clearCache();
  }, [activePdfUri, clearCache]);

  // Prepare extractor document — runs as soon as activePdfUri is known.
  // pageCount returned here lets the screen skip the Pdf metadata phase.
  useEffect(() => {
    if (!activePdfUri || !isPdfPageImageExtractorAvailable()) return;

    let cancelled = false;

    preparePdfDocument(activePdfUri)
      .then((prepared) => {
        if (cancelled) {
          disposePdfDocument(prepared.documentId);
          return;
        }
        extractorDocumentIdRef.current = prepared.documentId;
        setExtractorDocumentId(prepared.documentId);
        if (prepared.pageCount != null && prepared.pageCount > 0) {
          setPageCount(prepared.pageCount);
        }
        setExtractorReady(true);
      })
      .catch(() => {
        if (!cancelled) setExtractorReady(false);
      });

    return () => {
      cancelled = true;
      const docId = extractorDocumentIdRef.current;
      if (docId) {
        disposePdfDocument(docId);
        extractorDocumentIdRef.current = '';
      }
    };
  }, [activePdfUri]);

  // Extraction queue — runs one page at a time, drives the LRU cache
  useEffect(() => {
    // Do not start new extractions while the user is actively swiping.
    // Rendering a full-screen bitmap pegs the device CPU, which starves the JS bridge
    // and causes the `PanResponder` to feel delayed or the animation to drop frames ("flickering").
    if (!extractorReady || extractorBusy || totalPages <= 0 || !extractorDocumentId || dragDirection !== 'none') return;

    const pagesNeeded = primeWindow({ currentPage, totalPages, radius: 2, direction: dragDirection });
    if (pagesNeeded.length === 0) return;

    const inFlight = extractorInFlightPageRef.current;
    
    // Completely overwrite the queue with currently needed pages, sorted by priority.
    // This abandons any queued pages that are no longer relevant due to fast scrolling.
    extractorQueueRef.current = pagesNeeded
      .filter((p) => p !== inFlight)
      .sort((a, b) => {
        const dist = (p: number) => {
          if (p === currentPage) return 0;
          if (p === currentPage + 1) return 1;
          if (p === currentPage - 1) return 2;
          return Math.abs(p - currentPage) + 2;
        };
        return dist(a) - dist(b);
      });

    if (extractorQueueRef.current.length === 0) return;

    const page = extractorQueueRef.current.shift();
    if (!page) return;

    extractorInFlightPageRef.current = page;
    setExtractorBusy(true);

    const cssWidth = Math.floor(screenWidthRef.current);
    const scale = PixelRatio.get();
    const physWidth = Math.floor(cssWidth * scale);
    const physHeight = Math.floor(physWidth * 1.6);
    renderPdfPageToImage({ documentId: extractorDocumentId, page, width: physWidth, height: physHeight, quality: 95 })
      .then((uri) => {
        // Discard the delay logic. Set the image instantly so the user sees it
        // during fast swiping gestures instead of getting black screens.
        setPageImage(page, uri);
        touch(page);
      })
      .catch(() => {
        // Silent — Pdf component base remains visible
      })
      .finally(() => {
        setExtractorBusy(false);
        extractorInFlightPageRef.current = null;
      });
  }, [
    extractorReady,
    extractorBusy,
    extractorDocumentId,
    currentPage,
    totalPages,
    dragDirection,
    primeWindow,
    screenWidthRef,
    setPageImage,
    touch,
  ]);

  return {
    getPageImage,
    pageCount,
    isReady: extractorReady,
    clearCache,
  };
}
