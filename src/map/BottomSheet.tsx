import { useEffect, useRef, useState, type ReactNode } from 'react';

export type SheetSnap = 'peek' | 'half' | 'full';

const ORDER: SheetSnap[] = ['peek', 'half', 'full'];
export const SHEET_PEEK_PX = 122;

/** Visible sheet height in pixels for a snap, given the container height. */
export function sheetHeight(snap: SheetSnap, containerHeight: number): number {
  if (snap === 'peek') return SHEET_PEEK_PX;
  if (snap === 'half') return Math.round(containerHeight * 0.5);
  return Math.round(containerHeight * 0.88);
}

/**
 * Mobile bottom sheet with three snap points. Drag the handle, or tap it to
 * step through sizes; the expand button gives keyboard and screen-reader
 * users the same control.
 */
export default function BottomSheet({
  snap,
  onSnap,
  header,
  children,
  label,
}: {
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  header: ReactNode;
  children: ReactNode;
  label: string;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean; onControl: boolean } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [containerHeight, setContainerHeight] = useState(800);

  useEffect(() => {
    const parent = sheetRef.current?.parentElement;
    if (!parent) return;
    const update = () => setContainerHeight(parent.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const height = dragHeight ?? sheetHeight(snap, containerHeight);

  function nearestSnap(px: number): SheetSnap {
    return ORDER.reduce((best, candidate) =>
      Math.abs(sheetHeight(candidate, containerHeight) - px) < Math.abs(sheetHeight(best, containerHeight) - px)
        ? candidate
        : best,
    );
  }

  return (
    <div
      ref={sheetRef}
      role="region"
      aria-label={label}
      className="hn-map-sheet absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl border-t border-surface-container-highest bg-surface-container-lowest shadow-[0_-12px_40px_rgba(15,23,42,0.18)]"
      style={{ height, transition: dragHeight === null ? undefined : 'none' }}
    >
      <div
        className="shrink-0 touch-none select-none px-4 pb-2 pt-2.5"
        onPointerDown={(event) => {
          // Remember whether the press began on a real control. Pointer
          // capture is taken only once the finger actually drags, so a plain
          // tap still reaches the tab or button that was pressed.
          const onControl = Boolean((event.target as HTMLElement).closest('button, a, input, [role="tab"]'));
          drag.current = { startY: event.clientY, startHeight: height, moved: false, onControl };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = drag.current.startY - event.clientY;
          if (!drag.current.moved && Math.abs(delta) > 4) {
            drag.current.moved = true;
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          }
          if (!drag.current.moved) return;
          const next = Math.min(
            sheetHeight('full', containerHeight),
            Math.max(SHEET_PEEK_PX - 40, drag.current.startHeight + delta),
          );
          setDragHeight(next);
        }}
        onPointerUp={() => {
          const state = drag.current;
          drag.current = null;
          if (!state) return;
          if (!state.moved) {
            // Taps on real controls inside the header keep their own behavior.
            if (!state.onControl) onSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]);
            return;
          }
          onSnap(nearestSnap(dragHeight ?? height));
          setDragHeight(null);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragHeight(null);
        }}
      >
        <button
          type="button"
          aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
          aria-expanded={snap !== 'peek'}
          onClick={() => onSnap(snap === 'full' ? 'peek' : ORDER[ORDER.indexOf(snap) + 1])}
          className="mx-auto mb-2 block h-5 w-16 rounded-full"
        >
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-surface-container-highest" aria-hidden="true" />
        </button>
        {header}
      </div>
      <div data-map-panel-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
