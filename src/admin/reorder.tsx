import { useRef, useState, type DragEvent, type HTMLAttributes } from 'react';

/** Pointer-friendly drag reorder. Keyboard up/down buttons stay beside it. */
export function useDragReorder(length: number, move: (from: number, to: number) => void) {
  const from = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const bind = (index: number): HTMLAttributes<HTMLElement> => ({
    draggable: true,
    ...(over === index ? ({ 'data-drag': 'over' } as HTMLAttributes<HTMLElement>) : {}),
    onDragStart: (e: DragEvent) => {
      from.current = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (over !== index) setOver(index);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const start = from.current;
      if (start !== null && start !== index && start >= 0 && start < length) move(start, index);
      from.current = null;
      setOver(null);
    },
    onDragEnd: () => { from.current = null; setOver(null); },
  });
  return { bind };
}
