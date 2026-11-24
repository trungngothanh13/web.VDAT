import { usePopoverMenu } from '../../hooks/usePopoverMenu';
import type { useAuth } from '../../hooks/useAuth';
import type { useLiveStream } from '../../hooks/useLiveStream';
import type { CameraChannelState, useMultiCameraTransmitter } from '../../hooks/useMultiCameraTransmitter';
import type { useZoneAnnotation } from '../../hooks/useZoneAnnotation';

type AuthHook = ReturnType<typeof useAuth>;
type LiveStream = ReturnType<typeof useLiveStream>;
type Transmitters = ReturnType<typeof useMultiCameraTransmitter>;
type AnnotationHook = ReturnType<typeof useZoneAnnotation>;

interface CameraActionMenuProps {
  auth: AuthHook;
  stream: LiveStream;
  focusedCameraId: string;
  focusedChannel: CameraChannelState;
  transmitters: Transmitters;
  annotation: AnnotationHook;
  onOpenSourceDialog: () => void;
}

export function CameraActionMenu({
  auth,
  stream,
  focusedCameraId,
  focusedChannel,
  transmitters,
  annotation,
  onOpenSourceDialog,
}: CameraActionMenuProps) {
  const camMenu = usePopoverMenu({
    deps: [focusedChannel.sourceType, focusedChannel.isBroadcasting, auth.isAdmin],
  });

  return (
    <div style={{ minInlineSize: 0 }}>
      <button
        ref={camMenu.triggerRef}
        id="cam-menu-trigger"
        type="button"
        className="cam-title-trigger"
        aria-haspopup="menu"
        aria-expanded={camMenu.isOpen}
        {...({ commandfor: 'cam-action-menu', command: 'toggle-popover' } as any)}
        onClick={camMenu.onTriggerClick}
      >
        <span className="cam-title-text">
          Focused AI Stream ({focusedCameraId})
          {focusedChannel.isBroadcasting ? ` — ${focusedChannel.sourceLabel}` : ''}
        </span>
        <span className="cam-title-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {/* Directly after trigger so browsers emit no implicit aria-details */}
      <div
        ref={camMenu.popoverRef}
        id="cam-action-menu"
        {...({ popover: 'auto' } as any)}
        className="cam-dropdown-popover"
      >
        <div
          ref={camMenu.groupRef}
          {...({ focusgroup: 'menu nomemory' } as any)}
          aria-labelledby="cam-menu-trigger"
          className="cam-dropdown-menu"
        >
          <button
            type="button"
            onClick={() => {
              camMenu.close(0);
              onOpenSourceDialog();
            }}
          >
            <span>
              {focusedChannel.isBroadcasting ? 'Change Source...' : 'Choose Source...'}
            </span>
          </button>

          {auth.isAdmin && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={annotation.isAnnotatingZones}
              onKeyDown={camMenu.onCheckboxKeyDown}
              onClick={() => {
                annotation.toggleAnnotationMode(focusedCameraId, !annotation.isAnnotatingZones);
                camMenu.closeAfterCheckboxAction();
              }}
            >
              <span>Annotate Zones</span>
            </button>
          )}

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={Boolean(stream.bypassZonesByCamera[focusedCameraId])}
            disabled={!stream.isConnected}
            onKeyDown={camMenu.onCheckboxKeyDown}
            onClick={() => {
              const currentlyBypassed = Boolean(stream.bypassZonesByCamera[focusedCameraId]);
              stream.setCameraBypassZones(focusedCameraId, !currentlyBypassed);
              camMenu.closeAfterCheckboxAction();
            }}
          >
            <span>Bypass Zone Annotations</span>
          </button>

          {focusedChannel.sourceType === 'video_file' && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={focusedChannel.loopVideo}
              onKeyDown={camMenu.onCheckboxKeyDown}
              onClick={() => {
                transmitters.setLoopVideo(focusedCameraId, !focusedChannel.loopVideo);
                camMenu.closeAfterCheckboxAction();
              }}
            >
              <span>Loop Video</span>
            </button>
          )}

          <button
            type="button"
            className="menu-item-danger"
            disabled={!focusedChannel.isBroadcasting}
            onClick={() => {
              transmitters.stopBroadcast(focusedCameraId);
              camMenu.close(0);
            }}
          >
            <span>Stop Feed</span>
          </button>

          <hr />

          <div role="group" aria-label="Detection Engine">
            <div className="cam-menu-group-label" aria-hidden="true">
              Detect Engine
            </div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={stream.modelStatus.profile === 'trained'}
              disabled={
                !stream.isConnected ||
                stream.activeCameras.length === 0 ||
                Boolean(stream.modelStatus.switching)
              }
              onClick={() => {
                stream.switchAiModel('trained');
                camMenu.close(250);
              }}
            >
              <span>VDAT Trained (best.pt)</span>
              {stream.modelStatus.switching && stream.modelStatus.profile !== 'trained' && (
                <span className="hint" aria-hidden="true">
                  Switching...
                </span>
              )}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={stream.modelStatus.profile === 'stock'}
              disabled={
                !stream.isConnected ||
                stream.activeCameras.length === 0 ||
                Boolean(stream.modelStatus.switching)
              }
              onClick={() => {
                stream.switchAiModel('stock');
                camMenu.close(250);
              }}
            >
              <span>Stock YOLO26l (Legacy)</span>
              {stream.modelStatus.switching && stream.modelStatus.profile !== 'stock' && (
                <span className="hint" aria-hidden="true">
                  Switching...
                </span>
              )}
            </button>
          </div>

          <hr />

          <div role="group" aria-label="Tracking Engine">
            <div className="cam-menu-group-label" aria-hidden="true">
              Tracking Engine
            </div>
            {(
              [
                ['bytetrack', 'ByteTrack'],
                ['botsort', 'BoT-SORT'],
                ['deepsort', 'DeepSORT'],
              ] as const
            ).map(([trackerId, trackerLabel]) => (
              <button
                key={trackerId}
                type="button"
                role="menuitemradio"
                aria-checked={stream.trackerStatus.tracker === trackerId}
                disabled={
                  !stream.isConnected ||
                  stream.activeCameras.length === 0 ||
                  Boolean(stream.trackerStatus.switching)
                }
                onClick={() => {
                  stream.switchAiTracker(trackerId);
                  camMenu.close(250);
                }}
              >
                <span>{trackerLabel}</span>
                {stream.trackerStatus.switching &&
                  stream.trackerStatus.tracker !== trackerId && (
                    <span className="hint" aria-hidden="true">
                      Switching...
                    </span>
                  )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
