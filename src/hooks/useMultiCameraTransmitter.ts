import { useState, useRef, useEffect, useCallback } from 'react';
import { vdatWsClient } from '../websocket/client';
import { cameraApi } from '../api/camera.api';
import { DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT } from '../config/constants';
import type {
  TransmitterSourceType,
  VideoInputDevice,
} from './useCameraTransmitter';

export interface CameraChannelState {
  cameraId: string;
  sourceType: TransmitterSourceType;
  sourceKey: string;
  isBroadcasting: boolean;
  isAiHostedVideo: boolean;
  uploadProgress: number | null;
  sourceLabel: string;
  loopVideo: boolean;
  transmittedFrames: number;
  error: string | null;
  selectedDeviceId: string;
}

interface CameraChannelRuntime {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  mediaStream: MediaStream | null;
  objectUrl: string | null;
  timer: ReturnType<typeof setInterval> | null;
  frameCounter: number;
  encodingInFlight: boolean;
  lastUploadAt: number;
  sessionToken: number;
}

const MAX_WS_BUFFERED_BYTES = 512 * 1024; // Skip frame upload if WebSocket queue > 512 KB
const UPLOAD_QUALITY = 0.68;
const textEncoder = new TextEncoder();

let cachedUploadMime: 'image/webp' | 'image/jpeg' | null = null;
function getUploadMimeType(): 'image/webp' | 'image/jpeg' {
  if (cachedUploadMime) return cachedUploadMime;
  if (typeof document !== 'undefined') {
    try {
      const probe = document.createElement('canvas');
      probe.width = 2;
      probe.height = 2;
      if (probe.toDataURL('image/webp').startsWith('data:image/webp')) {
        cachedUploadMime = 'image/webp';
        return cachedUploadMime;
      }
    } catch {
      // Fallback to JPEG
    }
  }
  cachedUploadMime = 'image/jpeg';
  return cachedUploadMime;
}

function packBinarySourceFrame(header: Record<string, unknown>, frameBytes: Uint8Array): Uint8Array {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const out = new Uint8Array(4 + headerBytes.length + frameBytes.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, headerBytes.length, false);
  out.set(headerBytes, 4);
  out.set(frameBytes, 4 + headerBytes.length);
  return out;
}

export function createInitialChannelState(cameraId: string): CameraChannelState {
  return {
    cameraId,
    sourceType: 'none',
    sourceKey: `camera:${cameraId}`,
    isBroadcasting: false,
    isAiHostedVideo: false,
    uploadProgress: null,
    sourceLabel: 'Idle',
    loopVideo: true,
    transmittedFrames: 0,
    error: null,
    selectedDeviceId: '',
  };
}

export function useMultiCameraTransmitter() {
  const [channels, setChannels] = useState<Record<string, CameraChannelState>>({});
  const [webcamDevices, setWebcamDevices] = useState<VideoInputDevice[]>([]);
  const [baseTargetFps, setBaseTargetFps] = useState(15);

  const runtimesRef = useRef<Map<string, CameraChannelRuntime>>(new Map());
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const updateChannel = useCallback(
    (cameraId: string, patch: Partial<CameraChannelState>) => {
      setChannels((prev) => {
        const current = prev[cameraId] ?? createInitialChannelState(cameraId);
        return {
          ...prev,
          [cameraId]: { ...current, ...patch },
        };
      });
    },
    []
  );

  const getChannel = useCallback(
    (cameraId: string): CameraChannelState => {
      return channels[cameraId] ?? createInitialChannelState(cameraId);
    },
    [channels]
  );

  const getRuntime = useCallback((cameraId: string): CameraChannelRuntime => {
    let runtime = runtimesRef.current.get(cameraId);
    if (!runtime) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.crossOrigin = 'anonymous';
      video.setAttribute('aria-hidden', 'true');
      // Keep the offscreen video attached to document.body so Chromium never aborts play()
      // with "The play() request was interrupted because the media was removed from the document".
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      if (typeof document !== 'undefined' && document.body) {
        document.body.appendChild(video);
      }

      const canvas = document.createElement('canvas');
      canvas.width = DEFAULT_CAMERA_WIDTH;
      canvas.height = DEFAULT_CAMERA_HEIGHT;

      runtime = {
        video,
        canvas,
        mediaStream: null,
        objectUrl: null,
        timer: null,
        frameCounter: 0,
        encodingInFlight: false,
        lastUploadAt: 0,
        sessionToken: 0,
      };
      runtimesRef.current.set(cameraId, runtime);
    } else if (!runtime.video.isConnected && typeof document !== 'undefined' && document.body) {
      document.body.appendChild(runtime.video);
    }
    return runtime;
  }, []);

  const refreshWebcamDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Laptop Camera #${idx + 1}`,
        }));
      setWebcamDevices(videoInputs);
      return videoInputs;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void refreshWebcamDevices();
  }, [refreshWebcamDevices]);

  const safePlayVideo = useCallback(async (video: HTMLVideoElement, runtime: CameraChannelRuntime, token: number) => {
    if (!video.isConnected && typeof document !== 'undefined' && document.body) {
      document.body.appendChild(video);
    }

    const waitReady = () =>
      new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onErr = () => {
          cleanup();
          reject(new Error('Failed to load selected media source.'));
        };
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 1500);
        const cleanup = () => {
          clearTimeout(timer);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('error', onErr);
        };
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });
        video.addEventListener('error', onErr, { once: true });
      });

    await waitReady();
    if (runtime.sessionToken !== token) return false;

    try {
      await video.play();
      return runtime.sessionToken === token;
    } catch (err: any) {
      // Retry once after a short frame yield if Chrome fired a transient AbortError during source swap
      if (err?.name === 'AbortError' && runtime.sessionToken === token) {
        await new Promise((r) => setTimeout(r, 80));
        if (runtime.sessionToken !== token) return false;
        await video.play();
        return runtime.sessionToken === token;
      }
      throw err;
    }
  }, []);

  const stopBroadcast = useCallback(
    (cameraId: string) => {
      const wasAiHosted = Boolean(channelsRef.current[cameraId]?.isAiHostedVideo);
      const runtime = runtimesRef.current.get(cameraId);
      if (runtime) {
        runtime.sessionToken += 1;
        if (runtime.timer) {
          clearInterval(runtime.timer);
          runtime.timer = null;
        }
        if (runtime.mediaStream) {
          runtime.mediaStream.getTracks().forEach((t) => t.stop());
          runtime.mediaStream = null;
        }
        runtime.video.pause();
        runtime.video.srcObject = null;
        runtime.video.removeAttribute('src');

        if (runtime.objectUrl) {
          URL.revokeObjectURL(runtime.objectUrl);
          runtime.objectUrl = null;
        }

        const mainCtx = runtime.canvas.getContext('2d');
        mainCtx?.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
      }

      vdatWsClient.sendPayload({
        type: 'source_stop',
        cameraId,
      });

      if (wasAiHosted) {
        void cameraApi.stopCameraVideo(cameraId).catch(() => {});
      }

      updateChannel(cameraId, {
        isBroadcasting: false,
        isAiHostedVideo: false,
        uploadProgress: null,
        sourceType: 'none',
        sourceLabel: 'Idle',
        transmittedFrames: 0,
      });
    },
    [updateChannel]
  );

  // Sync AI-hosted uploaded video lifecycle (auto-reset when video finishes or reports an error)
  useEffect(() => {
    const unsub = vdatWsClient.onCameraSourceStatus((msg) => {
      const ch = channelsRef.current[msg.cameraId];
      if (!ch) return;
      if (msg.status === 'ended') {
        updateChannel(msg.cameraId, {
          isBroadcasting: false,
          isAiHostedVideo: false,
          uploadProgress: null,
          sourceType: 'none',
          sourceLabel: 'Idle',
          transmittedFrames: 0,
        });
      } else if (msg.status === 'error') {
        updateChannel(msg.cameraId, {
          error: msg.error || `AI engine failed to play '${msg.label || 'uploaded video'}'.`,
        });
        stopBroadcast(msg.cameraId);
      }
    });
    return unsub;
  }, [stopBroadcast, updateChannel]);

  const startCaptureInterval = useCallback(
    (
      cameraId: string,
      activeType: TransmitterSourceType,
      sourceKey: string,
      label: string,
      requestedFps: number
    ) => {
      const runtime = getRuntime(cameraId);
      if (runtime.timer) {
        clearInterval(runtime.timer);
      }

      const ctx = runtime.canvas.getContext('2d');
      if (!ctx) return;

      runtime.frameCounter = 0;
      runtime.encodingInFlight = false;
      runtime.lastUploadAt = 0;
      const uploadMime = getUploadMimeType();

      vdatWsClient.sendPayload({
        type: 'source_init',
        cameraId,
        sourceType: activeType,
        sourceKey,
        label,
        fps: requestedFps,
        width: DEFAULT_CAMERA_WIDTH,
        height: DEFAULT_CAMERA_HEIGHT,
      });

      const tickMs = Math.max(33, Math.round(1000 / Math.max(10, requestedFps)));
      runtime.timer = setInterval(() => {
        const { video, canvas } = runtime;
        if (video.paused || video.ended || video.readyState < 2) {
          return;
        }

        ctx.drawImage(video, 0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);

        // Adapt uplink pacing dynamically as webcam streams are added/stopped (15/12/10 FPS)
        const activeWebcamCount = Object.values(channelsRef.current).filter(
          (c) => c.isBroadcasting && !c.isAiHostedVideo
        ).length;
        const effectiveFps =
          activeWebcamCount >= 5
            ? Math.min(requestedFps, 10)
            : activeWebcamCount >= 3
              ? Math.min(requestedFps, 12)
              : requestedFps;
        const minUploadMs = Math.round(1000 / Math.max(1, effectiveFps));
        const now = performance.now();

        if (
          runtime.encodingInFlight ||
          now - runtime.lastUploadAt < minUploadMs - 8 ||
          vdatWsClient.getBufferedAmount() > MAX_WS_BUFFERED_BYTES
        ) {
          return;
        }

        runtime.encodingInFlight = true;
        runtime.lastUploadAt = now;

        const nextFrameId = runtime.frameCounter + 1;
        runtime.frameCounter = nextFrameId;

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              runtime.encodingInFlight = false;
              return;
            }
            blob
              .arrayBuffer()
              .then((ab) => {
                if (nextFrameId === 1 || nextFrameId % 15 === 0) {
                  updateChannel(cameraId, { transmittedFrames: nextFrameId });
                }

                const packet = packBinarySourceFrame(
                  {
                    type: 'source_frame',
                    cameraId,
                    sourceType: activeType,
                    frameNumber: nextFrameId,
                    fps: effectiveFps,
                    timestamp: Number((nextFrameId / effectiveFps).toFixed(2)),
                  },
                  new Uint8Array(ab)
                );
                vdatWsClient.sendBinary(packet);
              })
              .catch(() => {
                // Ignore transient encode/read errors
              })
              .finally(() => {
                runtime.encodingInFlight = false;
              });
          },
          uploadMime,
          UPLOAD_QUALITY
        );
      }, tickMs);
    },
    [getRuntime, updateChannel]
  );

  const startVideoFileStream = useCallback(
    async (cameraId: string, file: File) => {
      stopBroadcast(cameraId);
      updateChannel(cameraId, { error: null });

      const runtime = getRuntime(cameraId);
      const token = ++runtime.sessionToken;
      const currentChannel = channelsRef.current[cameraId] ?? createInitialChannelState(cameraId);
      const sourceKey = `file:${file.name}`;
      const label = file.name;

      try {
        updateChannel(cameraId, {
          sourceType: 'video_file',
          sourceKey,
          sourceLabel: label,
          isBroadcasting: true,
          isAiHostedVideo: true,
          uploadProgress: 0,
        });

        await cameraApi.uploadCameraVideo(cameraId, file, currentChannel.loopVideo, (pct) => {
          if (runtime.sessionToken === token) {
            updateChannel(cameraId, { uploadProgress: pct });
          }
        });

        if (runtime.sessionToken !== token) return;
        updateChannel(cameraId, { uploadProgress: null });
      } catch (err: any) {
        if (runtime.sessionToken !== token) return;
        const msg = err?.message || 'Failed to upload video file to AI engine.';
        updateChannel(cameraId, { error: msg });
        stopBroadcast(cameraId);
      }
    },
    [getRuntime, stopBroadcast, updateChannel]
  );

  const startLaptopCameraStream = useCallback(
    async (cameraId: string, deviceIdOverride?: string) => {
      stopBroadcast(cameraId);
      updateChannel(cameraId, { error: null });

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        updateChannel(cameraId, {
          error: 'Browser mediaDevices API is unavailable in this context.',
        });
        return;
      }

      const runtime = getRuntime(cameraId);
      const token = ++runtime.sessionToken;

      try {
        const currentChannel = channelsRef.current[cameraId] ?? createInitialChannelState(cameraId);
        const targetDevice = deviceIdOverride ?? currentChannel.selectedDeviceId;
        const constraints: MediaStreamConstraints = {
          video: {
            ...(targetDevice ? { deviceId: { exact: targetDevice } } : {}),
            width: { ideal: DEFAULT_CAMERA_WIDTH },
            height: { ideal: DEFAULT_CAMERA_HEIGHT },
            frameRate: { ideal: 30 },
          },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (runtime.sessionToken !== token) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }
        runtime.mediaStream = mediaStream;

        const devices = await refreshWebcamDevices();
        const activeTrack = mediaStream.getVideoTracks()[0];
        const trackLabel =
          activeTrack?.label ||
          devices.find((d) => d.deviceId === targetDevice)?.label ||
          'Laptop Hardware Camera';

        runtime.video.removeAttribute('src');
        runtime.video.srcObject = mediaStream;
        const ok = await safePlayVideo(runtime.video, runtime, token);
        if (!ok) return;

        const sourceKey = `webcam:${targetDevice || 'default'}`;
        const label = `Webcam: ${trackLabel}`;
        updateChannel(cameraId, {
          sourceType: 'laptop_webcam',
          sourceKey,
          sourceLabel: label,
          isBroadcasting: true,
          ...(targetDevice ? { selectedDeviceId: targetDevice } : {}),
        });
        startCaptureInterval(cameraId, 'laptop_webcam', sourceKey, label, baseTargetFps);
      } catch (err: any) {
        if (runtime.sessionToken !== token) return;
        updateChannel(cameraId, {
          error:
            err.message ||
            'Could not access laptop camera. Ensure camera permissions are granted in your browser.',
        });
        stopBroadcast(cameraId);
      }
    },
    [baseTargetFps, getRuntime, refreshWebcamDevices, safePlayVideo, startCaptureInterval, stopBroadcast, updateChannel]
  );

  const setLoopVideo = useCallback(
    (cameraId: string, loop: boolean) => {
      const runtime = runtimesRef.current.get(cameraId);
      if (runtime) {
        runtime.video.loop = loop;
      }
      updateChannel(cameraId, { loopVideo: loop });
      vdatWsClient.sendPayload({
        type: 'set_source_loop',
        cameraId,
        loop,
      });
    },
    [updateChannel]
  );

  const setSelectedDeviceId = useCallback(
    (cameraId: string, deviceId: string) => {
      updateChannel(cameraId, { selectedDeviceId: deviceId });
    },
    [updateChannel]
  );

  const getChannelSnapshot = useCallback((cameraId: string): string | null => {
    const runtime = runtimesRef.current.get(cameraId);
    if (!runtime || runtime.video.readyState < 2) return null;
    try {
      const ctx = runtime.canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(runtime.video, 0, 0, runtime.canvas.width, runtime.canvas.height);
      }
      return runtime.canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const runtime of runtimesRef.current.values()) {
        runtime.sessionToken += 1;
        if (runtime.timer) clearInterval(runtime.timer);
        if (runtime.mediaStream) {
          runtime.mediaStream.getTracks().forEach((t) => t.stop());
        }
        if (runtime.objectUrl) {
          URL.revokeObjectURL(runtime.objectUrl);
        }
        runtime.video.pause();
        runtime.video.srcObject = null;
        runtime.video.removeAttribute('src');
        runtime.video.remove();
      }
      runtimesRef.current.clear();
    };
  }, []);

  return {
    channels,
    getChannel,
    webcamDevices,
    targetFps: baseTargetFps,
    setTargetFps: setBaseTargetFps,
    setLoopVideo,
    setSelectedDeviceId,
    refreshWebcamDevices,
    startVideoFileStream,
    startLaptopCameraStream,
    stopBroadcast,
    getChannelSnapshot,
  };
}
