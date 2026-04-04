import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
}: {
  fileUri: string;
  currentPage: number;
  totalPages: number;
  pageCountReady: boolean;
  screenWidthRef: { current: number };
  canGoForward: boolean;
  canGoBackward: boolean;
  onPageCommit: (newPage: number) => void;
}) {
  const [dragIntent, setDragIntent] = useState<DragIntent>('none');

  const dragX = useRef(new Animated.Value(0)).current;
  const forwardOffsetAnim = useRef(new Animated.Value(screenWidthRef.current)).current;
  const backwardOffsetAnim = useRef(new Animated.Value(-screenWidthRef.current)).current;

  const isCommittingRef = useRef(false);
  const canGoForwardRef = useRef(canGoForward);
  const canGoBackwardRef = useRef(canGoBackward);
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  const pageCountReadyRef = useRef(pageCountReady);
  const dragIntentRef = useRef<DragIntent>('none');
  // Stable ref to the callback — panResponder never captures stale closures
  const onPageCommitRef = useRef(onPageCommit);

  // Sync refs every render so panResponder handlers always read fresh values
  canGoForwardRef.current = canGoForward;
  canGoBackwardRef.current = canGoBackward;
  currentPageRef.current = currentPage;
  totalPagesRef.current = totalPages;
  pageCountReadyRef.current = pageCountReady;
  onPageCommitRef.current = onPageCommit;

  // Reset animated state when the opened file changes
  useEffect(() => {
    dragX.setValue(0);
    dragIntentRef.current = 'none';
    setDragIntent('none');
    isCommittingRef.current = false;
  }, [fileUri, dragX]);

  const resetDrag = useCallback(() => {
    dragIntentRef.current = 'none';
    setDragIntent('none');
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
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
        useNativeDriver: true,
      }).start(() => {
        onPageCommitRef.current(nextPage);
        dragX.setValue(0);
        dragIntentRef.current = 'none';
        setDragIntent('none');
        isCommittingRef.current = false;
      });
    },
    [dragX, screenWidthRef]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, g) => !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
        onMoveShouldSetPanResponderCapture: (_evt, g) => !isCommittingRef.current && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 6,
        onPanResponderGrant: () => {
          if (isCommittingRef.current) return;
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
    forwardOffsetAnim,
    backwardOffsetAnim,
    dragIntent,
  };
}
