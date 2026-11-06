import { useState, useRef, useEffect, useCallback } from 'react';
import { vdatWsClient } from '../websocket/client';
import { env } from '../config/env';
import { DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT } from '../config/constants';

export type TransmitterSourceType = 'none' | 'video_file' | 'laptop_webcam';
export type CameraSourcePreset =
  | 'test_1.mp4'
  | 'test_2.mp4'
  | 'test_3.mp4'
  | 'custom_file'
  | 'laptop_webcam';

export interface VideoInputDevice {
  deviceId: string;
  label: string;
}

export function useCameraTransmitter(cameraId: string = 'cam-01') {
  const [sourcePreset, setSourcePreset] = useState<CameraSourcePreset>('test_1.mp4');
  const [sourceType, setSourceType] = useState<TransmitterSourceType>('none');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string>('No active web source');
  const [loopVideo, setLoopVideo] = useState(true);
  const [targetFps, setTargetFps] = useState(15);
  const [transmittedFrames, setTransmittedFrames] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [webcamDevices, setWebcamDevices] = useState<VideoInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCounterRef = useRef(0);

  const getElements = useCallback(() => {
    if (!videoElRef.current && typeof document !== 'undefined') {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.crossOrigin = 'anonymous';
      videoElRef.current = v;
    }
    if (!canvasElRef.current && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = DEFAULT_CAMERA_WIDTH;
      c.height = DEFAULT_CAMERA_HEIGHT;
      canvasElRef.current = c;
    }
    return { video: videoElRef.current!, canvas: canvasElRef.current! };
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
      if (videoInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
      return videoInputs;
    } catch {
      return [];
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    void refreshWebcamDevices();
  }, [refreshWebcamDevices]);

  const stopBroadcast = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (videoElRef.current) {
      videoElRef.current.pause();
      videoElRef.current.srcObject = null;
      videoElRef.current.removeAttribute('src');
      videoElRef.current.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    vdatWsClient.sendPayload({
      type: 'source_stop',
      cameraId,
    });

    setIsBroadcasting(false);
    setSourceType('none');
    setSourceLabel('No active web source');
  }, [cameraId]);

  const startCaptureInterval = useCallback(
    (activeType: TransmitterSourceType, label: string, fps: number) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      const { video, canvas } = getElements();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      frameCounterRef.current = 0;
      setTransmittedFrames(0);

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
      timerRef.current = setInterval(() => {
        if (video.paused || video.ended || video.readyState < 2) {
          return;
        }

        ctx.drawImage(video, 0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
        const base64Img = dataUrl.split(',')[1];
        if (!base64Img) return;

        frameCounterRef.current += 1;
        const count = frameCounterRef.current;
        if (count % 5 === 0) {
          setTransmittedFrames(count);
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
    [cameraId, getElements]
  );

  const startVideoFileStream = useCallback(
    async (fileOrUrl: File | string, customLabel?: string) => {
      stopBroadcast();
      setError(null);

      try {
        const { video } = getElements();
        video.loop = loopVideo;

        let label = customLabel || 'Web Video Stream';
        if (typeof fileOrUrl === 'string') {
          video.src = fileOrUrl;
        } else {
          const objUrl = URL.createObjectURL(fileOrUrl);
          objectUrlRef.current = objUrl;
          video.src = objUrl;
          label = `Video File: ${fileOrUrl.name}`;
          setSourcePreset('custom_file');
        }

        await video.play();
        setSourceType('video_file');
        setSourceLabel(label);
        setIsBroadcasting(true);
        startCaptureInterval('video_file', label, targetFps);
      } catch (err: any) {
        setError(err.message || 'Failed to play selected video file.');
        stopBroadcast();
      }
    },
    [getElements, loopVideo, startCaptureInterval, stopBroadcast, targetFps]
  );

  const startSampleVideoStream = useCallback(
    async (fileName: 'test_1.mp4' | 'test_2.mp4' | 'test_3.mp4' = 'test_1.mp4') => {
      setSourcePreset(fileName);
      const sampleUrl = `${env.apiUrl}/api/evidence/sample-video?file=${encodeURIComponent(fileName)}`;
      await startVideoFileStream(sampleUrl, `Built-in Footage: ${fileName}`);
    },
    [startVideoFileStream]
  );

  const startLaptopCameraStream = useCallback(
    async (deviceIdOverride?: string) => {
      stopBroadcast();
      setError(null);
      setSourcePreset('laptop_webcam');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Browser mediaDevices API is unavailable in this context.');
        return;
      }

      try {
        const targetDevice = deviceIdOverride ?? selectedDeviceId;
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
        mediaStreamRef.current = mediaStream;

        const devices = await refreshWebcamDevices();
        const activeTrack = mediaStream.getVideoTracks()[0];
        const trackLabel =
          activeTrack?.label ||
          devices.find((d) => d.deviceId === targetDevice)?.label ||
          'Laptop Hardware Camera';

        const { video } = getElements();
        video.srcObject = mediaStream;
        await video.play();

        const label = `Laptop Camera: ${trackLabel}`;
        setSourceType('laptop_webcam');
        setSourceLabel(label);
        setIsBroadcasting(true);
        startCaptureInterval('laptop_webcam', label, targetFps);
      } catch (err: any) {
        setError(
          err.message ||
            'Could not access laptop camera. Ensure camera permissions are granted in your browser.'
        );
        stopBroadcast();
      }
    },
    [getElements, refreshWebcamDevices, selectedDeviceId, startCaptureInterval, stopBroadcast, targetFps]
  );

  useEffect(() => {
    if (videoElRef.current) {
      videoElRef.current.loop = loopVideo;
    }
  }, [loopVideo]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  return {
    sourcePreset,
    setSourcePreset,
    sourceType,
    isBroadcasting,
    sourceLabel,
    loopVideo,
    setLoopVideo,
    targetFps,
    setTargetFps,
    transmittedFrames,
    error,
    webcamDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshWebcamDevices,
    startVideoFileStream,
    startSampleVideoStream,
    startLaptopCameraStream,
    stopBroadcast,
  };
}
