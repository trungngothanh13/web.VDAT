import { useRef } from 'react';
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_WIDTH } from '../../config/constants';
import { useLiveCanvasPlayer } from '../../hooks/useLiveCanvasPlayer';
import type { useLiveStream } from '../../hooks/useLiveStream';
import type { CameraChannelState } from '../../hooks/useMultiCameraTransmitter';

type LiveStream = ReturnType<typeof useLiveStream>;

interface LiveStreamViewportProps {
  stream: LiveStream;
  focusedCameraId: string;
  focusedChannel: CameraChannelState;
  cameraSlotIds: string[];
  onOpenSourceDialog: () => void;
}

export function LiveStreamViewport({
  stream,
  focusedCameraId,
  focusedChannel,
  cameraSlotIds,
  onOpenSourceDialog,
}: LiveStreamViewportProps) {
  const liveStreamCanvasRef = useRef<HTMLCanvasElement>(null);
  const isPausedRef = useRef(stream.isPaused);
  isPausedRef.current = stream.isPaused;

  const hasLiveCanvasFrame = useLiveCanvasPlayer(
    liveStreamCanvasRef,
    focusedCameraId,
    isPausedRef
  );

  return (
    <>
      <canvas
        ref={liveStreamCanvasRef}
        width={DEFAULT_CAMERA_WIDTH}
        height={DEFAULT_CAMERA_HEIGHT}
        className="stream-canvas"
        style={{ display: hasLiveCanvasFrame && stream.isCameraLive ? 'block' : 'none' }}
        aria-label={`Live AI feed from ${focusedCameraId}`}
      />
      {(!hasLiveCanvasFrame || !stream.isCameraLive) && (
        <div className="stream-placeholder">
          <div className="spinner" aria-hidden="true" />
          {focusedChannel.uploadProgress !== null ? (
            <>
              <span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>
                {focusedChannel.uploadProgress < 100
                  ? `Uploading "${focusedChannel.sourceLabel}" to AI engine (${focusedChannel.uploadProgress}%)...`
                  : `Syncing "${focusedChannel.sourceLabel}" to AI engine...`}
              </span>
              <span style={{ fontSize: '0.78rem', maxInlineSize: '60ch' }}>
                Video plays locally on the AI host once synced so zero uplink bandwidth is used during analysis.
              </span>
            </>
          ) : focusedChannel.isBroadcasting && !stream.isCameraLive ? (
            <>
              <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                {focusedChannel.isAiHostedVideo
                  ? `Hosting "${focusedChannel.sourceLabel}" on ${focusedCameraId}, waiting for AI stream...`
                  : `Feeding "${focusedChannel.sourceLabel}" (${focusedChannel.transmittedFrames} frames sent), but AI session for ${focusedCameraId} is not connected`}
              </span>
              <span style={{ fontSize: '0.78rem', maxInlineSize: '64ch' }}>
                Start the multi-camera AI engine with{' '}
                <code>
                  python main.py --web-input --cameras {cameraSlotIds.join(' ')} --ws-url ws://localhost:5000/ws/inference --no-video
                </code>
              </span>
            </>
          ) : (
            <>
              <span>Waiting for AI-annotated camera stream ({focusedCameraId})</span>
              <span style={{ fontSize: '0.78rem' }}>
                Open the camera title menu above to choose a video file or laptop camera while the AI engine is connected
              </span>
              <button
                type="button"
                className="btn btn-compact btn-active"
                onClick={onOpenSourceDialog}
              >
                Choose Source...
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
