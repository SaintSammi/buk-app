import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

type DragIntent = 'none' | 'left' | 'right';

export function usePageSwipe({
  fileUri,
  currentPage,
  totalPages,
  pageCountReady,
  screenWidthRef,
  canGoForward,
  canGoBackward,
  onPageCommit,
  onSingleTap,
}: {
  fileUri: string;
  currentPage: number;
  totalPages: number;
  pageCountReady: boolean;
  screenWidthRef: { current: number };
  canGoForward: boolean;
  canGoBackward: boolean;
  onPageCommit: (newPage: number) => void;
  onSingleTap?: () => void;
}) {
  const [dragIntent, setDragIntent] = useState<DragIntent>('none');

  const dragX = useRef(new Animated.Value(0)).current;

  const isCommittingRef = useRef(false);
  const canGoForwardRef = useRef(canGoForward);
  const canGoBackwardRef = useRef(canGoBackward);
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  const pageCountReadyRef = useRef(pageCountReady);
  const dragIntentRef = useRef<DragIntent>('none');
  const onPageCommitRef = useRef(onPageCommit);
  const onSingleTapRef = useRef(onSingleTap);
  const touchStartTimeRef = useRef(0);

  // Per-page base offset Animated.Values.
  // Each page gets a stable Animated.Value that never changes identity,
  // only its internal numeric value. This means the Animated.add() topology
  // created in PageStrip never has to be rebuilt — zero bridge thrashing.
  const pageBasesRef = useRef<Map<number, Animated.Value>>(new Map());

  // Sync refs every render so panResponder handlers always read fresh values
  canGoForwardRef.current = canGoForward;
  canGoBackwardRef.current = canGoBackward;
  currentPageRef.current = currentPage;
  totalPagesRef.current = totalPages;
  pageCountReadyRef.current = pageCountReady;
  onPageCommitRef.current = onPageCommit;
  onSingleTapRef.current = onSingleTap;

  // Get or create a stable Animated.Value for a page's base offset.
  // Called during render (from PageStrip) — safe because it's idempotent.
  const getPageBase = useCallback((page: number): Animated.Value => {
    let base = pageBasesRef.current.get(page);
    if (!base) {
      const cp = currentPageRef.current;
      const sw = screenWidthRef.current;
      const offset = page < cp ? -sw : page > cp ? sw : 0;
      base = new Animated.Value(offset);
      pageBasesRef.current.set(page, base);
    }
    return base;
  }, [screenWidthRef]);

  const prevPageRef = useRef(currentPage);

  // ──────────────────────────────────────────────────────────────────────
  // SINGLE ATOMIC RESET — the heartbeat of glitch-free page transitions.
  //
  // When currentPage changes (after a commit animation finishes):
  //   1. Reset dragX to 0
  //   2. Reset ALL per-page base offsets to their correct positions
  //   3. Unlock the gesture gate
  //
  // Because ALL setValue calls happen inside ONE useLayoutEffect:
  //   • They're synchronous JS calls in a single task
  //   • React Native batches all resulting setNativeProps into one native frame
  //   • No intermediate state is ever painted to the screen
  //
  // Previously, base offsets were reset in PageStrip's useLayoutEffect
  // (a child component), which fired BEFORE this hook's useLayoutEffect.
  // That created a 1-frame window where bases were corrected but dragX
  // was still at exitX — causing the black flash.
  // ──────────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (currentPage !== prevPageRef.current) {
      prevPageRef.current = currentPage;
      const sw = screenWidthRef.current;

      // 1. Reset the drag offset
      dragX.setValue(0);

      // 2. Reset every known page base to its correct slot
      pageBasesRef.current.forEach((base, page) => {
        if (page === currentPage) base.setValue(0);
        else if (page === currentPage - 1) base.setValue(-sw);
        else if (page === currentPage + 1) base.setValue(sw);
        // Pages outside the ±1 window: park far away (they're invisible)
        else base.setValue(page < currentPage ? -sw * 2 : sw * 2);
      });

      // 3. Prune stale entries to prevent unbounded growth
      for (const [page] of pageBasesRef.current) {
        if (Math.abs(page - currentPage) > 3) {
          pageBasesRef.current.delete(page);
        }
      }

      // 4. Unlock gesture gate
      isCommittingRef.current = false;
    }
  }, [currentPage, dragX, screenWidthRef]);

  // Reset animated state when the opened file changes
  useEffect(() => {
    dragX.setValue(0);
    pageBasesRef.current.clear();
    dragIntentRef.current = 'none';
    setDragIntent('none');
    isCommittingRef.current = false;
    prevPageRef.current = currentPage;
  }, [fileUri, dragX, currentPage]);

  const resetDrag = useCallback(() => {
    dragIntentRef.current = 'none';
    setDragIntent('none');
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: false,
      tension: 180,
      friction: 20,
      overshootClamping: true,
    }).start();
  }, [dragX]);

  const commitPageWithAnimatedSnap = useCallback(
    (nextPage: number, direction: 1 | -1, velocityX = 0) => {
      isCommittingRef.current = true;
      const exitX = direction > 0 ? screenWidthRef.current : -screenWidthRef.current;
      const speed = Math.min(Math.abs(velocityX), 4);
      const duration = Math.max(80, 220 - speed * 30);

      Animated.timing(dragX, {
        toValue: exitX,
        duration,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          isCommittingRef.current = false;
          return;
        }

        // Only trigger the state update. The ENTIRE visual reset
        // (dragX + all page bases) happens atomically in the
        // useLayoutEffect above when currentPage changes.
        onPageCommitRef.current(nextPage);
        dragIntentRef.current = 'none';
        setDragIntent('none');
      });
    },
    [dragX, screenWidthRef]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !isCommittingRef.current,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, g) => !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onMoveShouldSetPanResponderCapture: (_evt, g) => !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          if (isCommittingRef.current) return;
          touchStartTimeRef.current = Date.now();
          dragX.stopAnimation();
          dragX.setValue(0);
          dragIntentRef.current = 'none';
          setDragIntent('none');
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_evt, g) => {
          if (isCommittingRef.current || !pageCountReadyRef.current) return;
          const sw = screenWidthRef.current;
          const raw = g.dx;

          if (raw > 0) {
            if (!canGoBackwardRef.current) { dragX.setValue(0); return; }
            if (dragIntentRef.current !== 'right') { dragIntentRef.current = 'right'; setDragIntent('right'); }
            dragX.setValue(Math.min(raw, sw * 0.95));
            return;
          }

          if (raw < 0) {
            if (!canGoForwardRef.current) { dragX.setValue(0); return; }
            if (dragIntentRef.current !== 'left') { dragIntentRef.current = 'left'; setDragIntent('left'); }
            dragX.setValue(Math.max(raw, -sw * 0.95));
            return;
          }
        },
        onPanResponderRelease: (_evt, g) => {
          if (isCommittingRef.current) { resetDrag(); return; }
          if (!pageCountReadyRef.current) { resetDrag(); return; }
          const touchDuration = Date.now() - touchStartTimeRef.current;
          if (touchDuration < 200 && Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
            onSingleTapRef.current?.();
            resetDrag();
            return;
          }

          const dx = g.dx;
          const vx = g.vx;
          const sw = screenWidthRef.current;
          const shouldSnap = Math.abs(dx) / Math.max(1, sw) >= 0.2 || Math.abs(vx) >= 0.4;

          if (!shouldSnap || dragIntentRef.current === 'none') { resetDrag(); return; }

          const pg = currentPageRef.current;
          const tot = totalPagesRef.current;

          if (dx < 0 && canGoForwardRef.current && pg < tot) {
            commitPageWithAnimatedSnap(pg + 1, -1, vx);
            return;
          }

          if (dx > 0 && canGoBackwardRef.current && pg > 1) {
            commitPageWithAnimatedSnap(pg - 1, 1, vx);
            return;
          }

          resetDrag();
        },
        onPanResponderTerminate: () => resetDrag(),
      }),
    [dragX, resetDrag, commitPageWithAnimatedSnap, screenWidthRef]
  );

  return {
    panHandlers: panResponder.panHandlers,
    translateX: dragX,
    dragIntent,
    getPageBase,
  };
}
