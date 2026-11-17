import { useState, useRef, useEffect, useCallback } from 'react';
import { vdatWsClient } from '../websocket/client';
import { env } from '../config/env';
import { DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT } from '../config/constants';
import type {
  TransmitterSourceType,
  CameraSourcePreset,
  VideoInputDevice,
} from './useCameraTransmitter';

export interface CameraChannelState {
  cameraId: string;
  sourcePreset: CameraSourcePreset;
  sourceType: TransmitterSourceType;
  isBroadcasting: boolean;
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
  previewCanvases: Set<HTMLCanvasElement>;
}

function defaultPresetForCamera(cameraId: string): CameraSourcePreset {
  if (cameraId === 'cam-02') return 'test_2.mp4';
  if (cameraId === 'cam-03') return 'test_3.mp4';
  return 'test_1.mp4';
}

export function createInitialChannelState(cameraId: string): CameraChannelState {
  return {
    cameraId,
    sourcePreset: defaultPresetForCamera(cameraId),
    sourceType: 'none',
    isBroadcasting: false,
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
  const [targetFps, setTargetFps] = useState(15);

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
      video.crossOrigin = 'anonymous';

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
        previewCanvases: new Set(),
      };
      runtimesRef.current.set(cameraId, runtime);
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

  const stopBroadcast = useCallback(
    (cameraId: string) => {
      const runtime = runtimesRef.current.get(cameraId);
      if (runtime) {
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
        runtime.video.load();

        if (runtime.objectUrl) {
          URL.revokeObjectURL(runtime.objectUrl);
          runtime.objectUrl = null;
        }

        const mainCtx = runtime.canvas.getContext('2d');
        mainCtx?.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
        for (const pCanvas of runtime.previewCanvases) {
          pCanvas.getContext('2d')?.clearRect(0, 0, pCanvas.width, pCanvas.height);
        }
      }

      vdatWsClient.sendPayload({
        type: 'source_stop',
        cameraId,
      });

      updateChannel(cameraId, {
        isBroadcasting: false,
        sourceType: 'none',
        sourceLabel: 'Idle',
        transmittedFrames: 0,
      });
    },
    [updateChannel]
  );

  const startCaptureInterval = useCallback(
    (cameraId: string, activeType: TransmitterSourceType, label: string, fps: number) => {
      const runtime = getRuntime(cameraId);
      if (runtime.timer) {
        clearInterval(runtime.timer);
      }

      const ctx = runtime.canvas.getContext('2d');
      if (!ctx) return;

      runtime.frameCounter = 0;

      vdatWsClient.sendPayload({
        type: 'source_init',
        cameraId,
        sourceType: activeType,
        label,
        fps,
        width: DEFAULT_CAMERA_WIDTH,
        height: DEFAULT_CAMERA_HEIGHT,
      });

      const intervalMs = Math.max(33, Math.round(1000 / fps));
      runtime.timer = setInterval(() => {
        const { video, canvas, previewCanvases } = runtime;
        if (video.paused || video.ended || video.readyState < 2) {
          return;
        }

        ctx.drawImage(video, 0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);

        // Render raw preview onto any mounted multi-camera wall preview tiles (0 extra network cost)
        for (const pCanvas of previewCanvases) {
          const pCtx = pCanvas.getContext('2d');
          if (pCtx) {
            pCtx.drawImage(canvas, 0, 0, pCanvas.width, pCanvas.height);
          }
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
        const base64Img = dataUrl.split(',')[1];
        if (!base64Img) return;

        runtime.frameCounter += 1;
        const count = runtime.frameCounter;
        if (count === 1 || count % 5 === 0) {
          updateChannel(cameraId, { transmittedFrames: count });
        }

        vdatWsClient.sendPayload({
          type: 'source_frame',
          cameraId,
          sourceType: activeType,
          frameNumber: count,
          fps,
          timestamp: Number((count / fps).toFixed(2)),
          image: base64Img,
        });
      }, intervalMs);
    },
    [getRuntime, updateChannel]
  );

  const startVideoFileStream = useCallback(
    async (cameraId: string, fileOrUrl: File | string, customLabel?: string) => {
      stopBroadcast(cameraId);
      updateChannel(cameraId, { error: null });

      try {
        const runtime = getRuntime(cameraId);
        const currentChannel = channelsRef.current[cameraId] ?? createInitialChannelState(cameraId);
        runtime.video.loop = currentChannel.loopVideo;

        let label = customLabel || 'Web Video Stream';
        if (typeof fileOrUrl === 'string') {
          runtime.video.src = fileOrUrl;
        } else {
          const objUrl = URL.createObjectURL(fileOrUrl);
          runtime.objectUrl = objUrl;
          runtime.video.src = objUrl;
          label = `Video: ${fileOrUrl.name}`;
          updateChannel(cameraId, { sourcePreset: 'custom_file' });
        }

        await runtime.video.play();
        updateChannel(cameraId, {
          sourceType: 'video_file',
          sourceLabel: label,
          isBroadcasting: true,
        });
        startCaptureInterval(cameraId, 'video_file', label, targetFps);
      } catch (err: any) {
        updateChannel(cameraId, {
          error: err.message || 'Failed to play selected video file.',
        });
        stopBroadcast(cameraId);
      }
    },
    [getRuntime, startCaptureInterval, stopBroadcast, targetFps, updateChannel]
  );

  const startSampleVideoStream = useCallback(
    async (
      cameraId: string,
      fileName: 'test_1.mp4' | 'test_2.mp4' | 'test_3.mp4' = 'test_1.mp4'
    ) => {
      updateChannel(cameraId, { sourcePreset: fileName });
      const sampleUrl = `${env.apiUrl}/api/evidence/sample-video?file=${encodeURIComponent(fileName)}`;
      await startVideoFileStream(cameraId, sampleUrl, `Built-in: ${fileName}`);
    },
    [startVideoFileStream, updateChannel]
  );

  const startLaptopCameraStream = useCallback(
    async (cameraId: string, deviceIdOverride?: string) => {
      stopBroadcast(cameraId);
      updateChannel(cameraId, { error: null, sourcePreset: 'laptop_webcam' });

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        updateChannel(cameraId, {
          error: 'Browser mediaDevices API is unavailable in this context.',
        });
        return;
      }

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
        const runtime = getRuntime(cameraId);
        runtime.mediaStream = mediaStream;

        const devices = await refreshWebcamDevices();
        const activeTrack = mediaStream.getVideoTracks()[0];
        const trackLabel =
          activeTrack?.label ||
          devices.find((d) => d.deviceId === targetDevice)?.label ||
          'Laptop Hardware Camera';

        runtime.video.srcObject = mediaStream;
        await runtime.video.play();

        const label = `Webcam: ${trackLabel}`;
        updateChannel(cameraId, {
          sourceType: 'laptop_webcam',
          sourceLabel: label,
          isBroadcasting: true,
          ...(targetDevice ? { selectedDeviceId: targetDevice } : {}),
        });
        startCaptureInterval(cameraId, 'laptop_webcam', label, targetFps);
      } catch (err: any) {
        updateChannel(cameraId, {
          error:
            err.message ||
            'Could not access laptop camera. Ensure camera permissions are granted in your browser.',
        });
        stopBroadcast(cameraId);
      }
    },
    [getRuntime, refreshWebcamDevices, startCaptureInterval, stopBroadcast, targetFps, updateChannel]
  );

  const setSourcePreset = useCallback(
    (cameraId: string, preset: CameraSourcePreset) => {
      updateChannel(cameraId, { sourcePreset: preset });
    },
    [updateChannel]
  );

  const setLoopVideo = useCallback(
    (cameraId: string, loop: boolean) => {
      const runtime = runtimesRef.current.get(cameraId);
      if (runtime) {
        runtime.video.loop = loop;
      }
      updateChannel(cameraId, { loopVideo: loop });
    },
    [updateChannel]
  );

  const setSelectedDeviceId = useCallback(
    (cameraId: string, deviceId: string) => {
      updateChannel(cameraId, { selectedDeviceId: deviceId });
    },
    [updateChannel]
  );

  const bindPreviewCanvas = useCallback((cameraId: string, canvasEl: HTMLCanvasElement | null) => {
    const runtime = runtimesRef.current.get(cameraId);
    if (!canvasEl) {
      if (runtime) {
        // Clean up disconnected canvas elements
        for (const existing of Array.from(runtime.previewCanvases)) {
          if (!existing.isConnected) {
            runtime.previewCanvases.delete(existing);
          }
        }
      }
      return;
    }
    const targetRuntime = runtime ?? getRuntime(cameraId);
    targetRuntime.previewCanvases.add(canvasEl);
    // Synchronously paint current frame if active
    const pCtx = canvasEl.getContext('2d');
    if (pCtx && !targetRuntime.video.paused && targetRuntime.video.readyState >= 2) {
      pCtx.drawImage(targetRuntime.canvas, 0, 0, canvasEl.width, canvasEl.height);
    }
  }, [getRuntime]);

  const getChannelSnapshot = useCallback((cameraId: string): string | null => {
    const runtime = runtimesRef.current.get(cameraId);
    if (!runtime || runtime.video.readyState < 2) return null;
    try {
      return runtime.canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const runtime of runtimesRef.current.values()) {
        if (runtime.timer) clearInterval(runtime.timer);
        if (runtime.mediaStream) {
          runtime.mediaStream.getTracks().forEach((t) => t.stop());
        }
        if (runtime.objectUrl) {
          URL.revokeObjectURL(runtime.objectUrl);
        }
      }
      runtimesRef.current.clear();
    };
  }, []);

  return {
    channels,
    getChannel,
    webcamDevices,
    targetFps,
    setTargetFps,
    setSourcePreset,
    setLoopVideo,
    setSelectedDeviceId,
    refreshWebcamDevices,
    startVideoFileStream,
    startSampleVideoStream,
    startLaptopCameraStream,
    stopBroadcast,
    bindPreviewCanvas,
    getChannelSnapshot,
  };
}
