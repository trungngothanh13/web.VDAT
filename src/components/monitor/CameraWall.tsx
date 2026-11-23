import { useRef } from 'react';
import { getLightConfig } from '../../config/constants';
import { useStreamStore } from '../../stores/stream.store';
import { ManageCamerasDialog } from '../dialogs/ManageCamerasDialog';
import type { useAuth } from '../../hooks/useAuth';
import type { useLiveStream } from '../../hooks/useLiveStream';
import type { useMultiCameraTransmitter } from '../../hooks/useMultiCameraTransmitter';
import type { Camera } from '../../types/camera.types';

type AuthHook = ReturnType<typeof useAuth>;
type LiveStream = ReturnType<typeof useLiveStream>;
type Transmitters = ReturnType<typeof useMultiCameraTransmitter>;

interface CameraWallProps {
  auth: AuthHook;
  cameraSlots: Camera[];
  stream: LiveStream;
  transmitters: Transmitters;
  focusedCameraId: string;
  onInspect: (camId: string) => void;
  onCamerasDeleted: (deletedIds: string[]) => void;
}

export function CameraWall({
  auth,
  cameraSlots,
  stream,
  transmitters,
  focusedCameraId,
  onInspect,
  onCamerasDeleted,
}: CameraWallProps) {
  const manageCamerasDialogRef = useRef<HTMLDialogElement>(null);
  const telemetryByCamera = useStreamStore((s) => s.telemetryByCamera);

  const openManageCamerasDialog = () => {
    const dialog = manageCamerasDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  return (
    <section className="card" aria-labelledby="camera-wall-title">
      <div className="card-header">
        <span id="camera-wall-title">
          Multi-Camera Source Wall ({cameraSlots.length} Slots • {stream.activeCameras.length} AI Online)
        </span>
        <div className="toolbar-actions">
          {auth.isAdmin && (
            <button
              type="button"
              className="btn btn-compact btn-active"
              onClick={openManageCamerasDialog}
            >
              Add / Delete Camera
            </button>
          )}
        </div>
      </div>

      <div className="camera-wall-grid">
        {cameraSlots.length === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '1.5rem',
              color: 'var(--text-muted)',
              fontSize: '0.84rem',
            }}
          >
            No camera slots registered. Click <strong>Add / Delete Camera</strong> to add one.
          </div>
        )}
        {cameraSlots.map((cam) => {
          const ch = transmitters.getChannel(cam.id);
          const camTelemetry = telemetryByCamera[cam.id];
          const isAiOnline = stream.activeCameras.includes(cam.id);
          const isFocused = focusedCameraId === cam.id;
          const camLightCfg = getLightConfig(camTelemetry?.light_state);
          const previewSrc = stream.cameraPreviews[cam.id];

          return (
            <article
              key={cam.id}
              className={`camera-tile ${isFocused ? 'camera-tile-focused' : ''}`}
            >
              <div className="camera-tile-media">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={`${cam.id} snapshot preview`}
                    className="camera-tile-canvas"
                  />
                ) : (
                  <div className="camera-tile-placeholder">
                    <span>
                      {ch.uploadProgress !== null ? (
                        <>
                          Uploading <strong>{ch.sourceLabel}</strong> ({ch.uploadProgress}%)…
                        </>
                      ) : (
                        <>
                          No active source on <strong>{cam.id}</strong>
                          <br />
                          Click Inspect Camera to configure
                        </>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <header className="camera-tile-header">
                <h3 className="camera-tile-title">
                  {cam.id} — {cam.name}
                </h3>
                <button
                  type="button"
                  className={`btn btn-compact ${isFocused ? 'btn-active' : ''}`}
                  onClick={() => onInspect(cam.id)}
                >
                  {isFocused ? 'Inspecting' : 'Inspect Camera'}
                </button>
              </header>

              <div className="camera-tile-telemetry">
                <span
                  style={{
                    color: isAiOnline ? 'var(--success-text)' : 'var(--danger-text)',
                    fontWeight: 600,
                  }}
                >
                  {isAiOnline ? 'AI Online' : 'AI Offline'}
                </span>
                <span>Vehicles: {camTelemetry?.vehicle_count ?? 0}</span>
                <span>Tracked: {camTelemetry?.total_tracked ?? 0}</span>
                <span>
                  Violations: {camTelemetry?.violations_count ?? cam.violationCount ?? 0}
                </span>
                <span style={{ color: camLightCfg.color }}>{camLightCfg.label}</span>
              </div>
            </article>
          );
        })}
      </div>

      <ManageCamerasDialog
        dialogRef={manageCamerasDialogRef}
        cameraSlots={cameraSlots}
        activeCameras={stream.activeCameras}
        onCamerasDeleted={onCamerasDeleted}
      />
    </section>
  );
}
