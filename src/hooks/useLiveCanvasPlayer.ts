import { useEffect, useState, type MutableRefObject, type RefObject } from 'react';
import { vdatWsClient } from '../websocket/client';

export function useLiveCanvasPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  cameraId: string,
  isPausedRef: MutableRefObject<boolean>
): boolean {
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    setHasFrame(false);

    let cancelled = false;
    const queue: ImageBitmap[] = [];
    const MAX_QUEUE = 4;
    let emaIntervalMs = 55;
    let lastArrivalAt = 0;
    let lastDrawAt = 0;
    let rafId = 0;
    let firstFrameShown = false;

    const clearQueue = () => {
      while (queue.length > 0) {
        queue.shift()?.close();
      }
    };

    const unsubRaw = vdatWsClient.onRawLiveFrame((pkt) => {
      if (cancelled || pkt.cameraId !== cameraId || isPausedRef.current) return;
      const now = performance.now();
      if (lastArrivalAt > 0) {
        const delta = now - lastArrivalAt;
        if (delta >= 15 && delta <= 250) {
          emaIntervalMs = emaIntervalMs * 0.8 + delta * 0.2;
        }
      }
      lastArrivalAt = now;

      void createImageBitmap(pkt.blob)
        .then((bitmap) => {
          if (cancelled) {
            bitmap.close();
            return;
          }
          if (queue.length >= MAX_QUEUE) {
            queue.shift()?.close();
          }
          queue.push(bitmap);
        })
        .catch(() => {
          // Ignore corrupt/cancelled decode
        });
    });

    const unsubStatus = vdatWsClient.onCameraSourceStatus((msg) => {
      if (msg.cameraId === cameraId && (msg.status === 'stopped' || msg.status === 'ended')) {
        clearQueue();
        firstFrameShown = false;
        setHasFrame(false);
      }
    });

    const drawLoop = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(drawLoop);

      if (queue.length === 0) return;

      const basePace = Math.min(85, Math.max(32, emaIntervalMs));
      const targetGap =
        queue.length >= 3 ? basePace * 0.55 : queue.length === 2 ? basePace * 0.8 : basePace * 0.92;

      if (lastDrawAt === 0 || now - lastDrawAt >= targetGap) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const bitmap = queue.shift();
        if (bitmap) {
          if (canvas && ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            lastDrawAt = now;
            if (!firstFrameShown) {
              firstFrameShown = true;
              setHasFrame(true);
            }
          }
          bitmap.close();
        }
      }
    };

    rafId = requestAnimationFrame(drawLoop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      unsubRaw();
      unsubStatus();
      clearQueue();
    };
  }, [cameraId, canvasRef, isPausedRef]);

  return hasFrame;
}
