import type { RefObject } from 'react';
import { useDialogLightDismiss } from '../../hooks/useDialogLightDismiss';
import type { CameraChannelState, useMultiCameraTransmitter } from '../../hooks/useMultiCameraTransmitter';

type Transmitters = ReturnType<typeof useMultiCameraTransmitter>;

interface SourceDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  focusedCameraId: string;
  focusedChannel: CameraChannelState;
  transmitters: Transmitters;
  onUploadClick: () => void;
  onClose: () => void;
  onSourceChanged: () => void;
}

export function SourceDialog({
  dialogRef,
  focusedCameraId,
  focusedChannel,
  transmitters,
  onUploadClick,
  onClose,
  onSourceChanged,
}: SourceDialogProps) {
  useDialogLightDismiss(dialogRef);

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      className="app-dialog source-dialog"
      aria-labelledby="source-dialog-title"
    >
      <div className="dialog-header">
        <h1 id="source-dialog-title" className="dialog-title">
          {focusedChannel.isBroadcasting ? 'Change Source' : 'Choose Source'} ({focusedCameraId})
        </h1>
        <form method="dialog">
          <button type="submit" className="btn btn-compact">
            Close
          </button>
        </form>
      </div>

      <div className="dialog-body">
        <div className="source-dialog-status">
          <span>
            {focusedChannel.isBroadcasting ? (
              <>
                Active: <strong>{focusedChannel.sourceLabel}</strong> (
                {focusedChannel.uploadProgress !== null
                  ? `Uploading ${focusedChannel.uploadProgress}%`
                  : focusedChannel.isAiHostedVideo
                    ? 'AI Hosted'
                    : `${focusedChannel.transmittedFrames} frames`}
                )
              </>
            ) : (
              <>No active source connected on {focusedCameraId}.</>
            )}
          </span>
        </div>

        <div className="source-dialog-options">
          <button type="button" className="btn btn-active" onClick={onUploadClick}>
            {focusedChannel.sourceType === 'video_file'
              ? 'Choose Different Video File (.mp4)...'
              : 'Upload Video File (.mp4)...'}
          </button>

          <button
            type="button"
            className={`btn ${focusedChannel.sourceType === 'laptop_webcam' ? 'btn-active' : ''}`}
            onClick={() => {
              onSourceChanged();
              void transmitters.startLaptopCameraStream(focusedCameraId);
              onClose();
            }}
          >
            Use Laptop Camera (Webcam)
          </button>

          {transmitters.webcamDevices.length > 0 && (
            <div className="form-field">
              <label htmlFor="source-webcam-select" className="form-label">
                Webcam Device
              </label>
              <select
                id="source-webcam-select"
                className="btn"
                value={focusedChannel.selectedDeviceId}
                onChange={(e) => {
                  transmitters.setSelectedDeviceId(focusedCameraId, e.target.value);
                  onSourceChanged();
                  void transmitters.startLaptopCameraStream(focusedCameraId, e.target.value);
                  onClose();
                }}
              >
                {transmitters.webcamDevices.map((dev) => (
                  <option key={dev.deviceId} value={dev.deviceId}>
                    {dev.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
