import { useEffect, type RefObject } from 'react';

function bindDialogLightDismissFallback(dialog: HTMLDialogElement | null): () => void {
  if (!dialog || typeof HTMLDialogElement === 'undefined') return () => {};
  if ('closedBy' in HTMLDialogElement.prototype) return () => {};

  const outside = (event: PointerEvent) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  let pressedOutside = false;
  const handlePointerDown = (event: PointerEvent) => {
    pressedOutside = outside(event);
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (pressedOutside && outside(event)) {
      dialog.close();
    }
    pressedOutside = false;
  };

  dialog.addEventListener('pointerdown', handlePointerDown);
  dialog.addEventListener('pointerup', handlePointerUp);
  return () => {
    dialog.removeEventListener('pointerdown', handlePointerDown);
    dialog.removeEventListener('pointerup', handlePointerUp);
  };
}

export function useDialogLightDismiss(ref: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => bindDialogLightDismissFallback(ref.current), [ref]);
}
