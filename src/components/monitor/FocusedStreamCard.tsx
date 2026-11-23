import { useRef } from 'react';
import { CameraActionMenu } from './CameraActionMenu';
import { ZoneEditorCanvas } from './ZoneEditorCanvas';
import { LiveStreamViewport } from './LiveStreamViewport';
import { StreamHud } from './StreamHud';
import { SourceDialog } from '../dialogs/SourceDialog';
import type { useAuth } from '../../hooks/useAuth';
import type { useLiveStream } from '../../hooks/useLiveStream';
import type { CameraChannelState, useMultiCameraTransmitter } from '../../hooks/useMultiCameraTransmitter';
import type { useZoneAnnotation } from '../../hooks/useZoneAnnotation';

type AuthHook = ReturnType<typeof useAuth>;
type LiveStream = ReturnType<typeof useLiveStream>;
type Transmitters = ReturnType<typeof useMultiCameraTransmitter>;
type AnnotationHook = ReturnType<typeof useZoneAnnotation>;

interface FocusedStreamCardProps {
  auth: AuthHook;
  stream: LiveStream;
  focusedCameraId: string;
  focusedChannel: CameraChannelState;
  transmitters: Transmitters;
  annotation: AnnotationHook;
  cameraSlotIds: string[];
  fallbackViolationCount: number;
}

export function FocusedStreamCard({
  auth,
  stream,
  focusedCameraId,
  focusedChannel,
  transmitters,
  annotation,
  cameraSlotIds,
  fallbackViolationCount,
}: FocusedStreamCardProps) {
  const focusedFileInputRef = useRef<HTMLInputElement>(null);
  const sourceDialogRef = useRef<HTMLDialogElement>(null);

  const openSourceDialog = () => {
    const dialog = sourceDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  const closeSourceDialog = () => {
    const dialog = sourceDialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    }
  };

  return (
    <section className="card card-stream" aria-labelledby="cam-menu-trigger">
      <div className="card-header">
        <CameraActionMenu
          auth={auth}
          stream={stream}
          focusedCameraId={focusedCameraId}
          focusedChannel={focusedChannel}
          transmitters={transmitters}
          annotation={annotation}
          onOpenSourceDialog={openSourceDialog}
        />
        <div className="toolbar-actions" />
      </div>

      <input
        ref={focusedFileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            annotation.clearSnapshot();
            void transmitters.startVideoFileStream(focusedCameraId, file);
            closeSourceDialog();
            e.target.value = '';
          }
        }}
      />

      {focusedChannel.error && (
        <div
          style={{
            padding: '0.45rem 1rem',
            background: 'var(--danger-soft)',
            borderBlockEnd: '1px solid var(--danger-border)',
            color: 'var(--danger-text)',
            fontSize: '0.78rem',
          }}
        >
          {focusedChannel.error}
        </div>
      )}

      {annotation.zoneSyncBanner && (
        <div
          style={{
            padding: '0.45rem 1rem',
            background: 'var(--primary-soft)',
            borderBlockEnd: '1px solid var(--primary-border)',
            color: 'var(--primary-text)',
            fontSize: '0.78rem',
          }}
        >
          {annotation.zoneSyncBanner}
        </div>
      )}

      <div className="video-viewport">
        {annotation.isAnnotatingZones && auth.isAdmin ? (
          <ZoneEditorCanvas
            annotation={annotation}
            focusedCameraId={focusedCameraId}
            onOpenSourceDialog={openSourceDialog}
          />
        ) : (
          <LiveStreamViewport
            stream={stream}
            focusedCameraId={focusedCameraId}
            focusedChannel={focusedChannel}
            cameraSlotIds={cameraSlotIds}
            onOpenSourceDialog={openSourceDialog}
          />
        )}
      </div>

      <StreamHud
        isBypassed={Boolean(stream.bypassZonesByCamera[focusedCameraId])}
        fallbackViolationCount={fallbackViolationCount}
      />

      <SourceDialog
        dialogRef={sourceDialogRef}
        focusedCameraId={focusedCameraId}
        focusedChannel={focusedChannel}
        transmitters={transmitters}
        onUploadClick={() => focusedFileInputRef.current?.click()}
        onClose={closeSourceDialog}
        onSourceChanged={annotation.clearSnapshot}
      />
    </section>
  );
}
