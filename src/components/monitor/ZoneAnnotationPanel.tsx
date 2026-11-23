import { useRef } from 'react';
import type { CameraChannelState } from '../../hooks/useMultiCameraTransmitter';
import type { useZoneAnnotation } from '../../hooks/useZoneAnnotation';

type AnnotationHook = ReturnType<typeof useZoneAnnotation>;

interface ZoneAnnotationPanelProps {
  annotation: AnnotationHook;
  focusedCameraId: string;
  focusedChannel: CameraChannelState;
}

export function ZoneAnnotationPanel({
  annotation,
  focusedCameraId,
  focusedChannel,
}: ZoneAnnotationPanelProps) {
  const { zoneEditor, currentCamera, isSaving, toggleAnnotationMode, grabFrame, saveZones } =
    annotation;
  const lastClearanceRef = useRef<number>(5);
  if (zoneEditor.geometry.clearanceSeconds > 0) {
    lastClearanceRef.current = zoneEditor.geometry.clearanceSeconds;
  }
  const hasClearanceGrace = zoneEditor.geometry.clearanceSeconds > 0;

  return (
    <aside className="card annotate-sidebar" aria-labelledby="annotate-panel-title">
      <div className="card-header">
        <span id="annotate-panel-title">Zone Annotation ({focusedCameraId})</span>
        <span className="badge badge-standby" style={{ fontSize: '0.62rem' }}>
          {focusedChannel.isBroadcasting
            ? focusedChannel.sourceKey
            : currentCamera?.activeSourceKey ||
              currentCamera?.config?.sourceKey ||
              `camera:${focusedCameraId}`}
        </span>
      </div>

      {/* Separate Top Save / Exit Bar */}
      <div className="annotate-save-bar">
        <button
          type="button"
          className="btn btn-active"
          disabled={isSaving}
          onClick={() => void saveZones(focusedChannel)}
        >
          {isSaving ? 'Saving...' : 'Save & Sync'}
        </button>
        <button
          type="button"
          className="btn btn-warning"
          onClick={() => toggleAnnotationMode(focusedCameraId, false)}
        >
          Exit Editor
        </button>
      </div>

      <div className="annotate-body">
        {/* 1. Icon Controls: Grab Frame, Undo, Redo, Cancel Current */}
        <div className="annotate-section">
          <div className="annotate-icon-bar" role="group" aria-label="Canvas quick actions">
            <button
              type="button"
              className="annotate-icon-btn"
              aria-label="Grab Fresh Frame"
              title="Grab Fresh Frame"
              onClick={grabFrame}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <span>Grab</span>
            </button>

            <button
              type="button"
              className="annotate-icon-btn"
              aria-label="Undo"
              title="Undo"
              disabled={!zoneEditor.canUndo}
              onClick={() => zoneEditor.undo()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              <span>Undo</span>
            </button>

            <button
              type="button"
              className="annotate-icon-btn"
              aria-label="Redo"
              title="Redo"
              disabled={!zoneEditor.canRedo}
              onClick={() => zoneEditor.redo()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
              <span>Redo</span>
            </button>

            <button
              type="button"
              className="annotate-icon-btn"
              aria-label="Cancel current polygon drawing (Esc)"
              title="Cancel current polygon drawing (Esc)"
              disabled={zoneEditor.activeDrawingPoints.length === 0}
              onClick={() => zoneEditor.cancelDrawing()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
              <span>Cancel Draw</span>
            </button>
          </div>
        </div>

        {/* 2. Lanes (Color-Synced with Canvas Drawing) */}
        <div className="annotate-section">
          <div className="zone-section-title" style={{ marginBlockEnd: 0 }}>
            Lanes &amp; Zones
          </div>
          <div className="annotate-tool-grid" role="group" aria-label="Zone drawing tools">
            <button
              type="button"
              className={`btn btn-compact zone-btn-approach ${
                zoneEditor.mode === 'draw_lane' ? 'is-selected' : ''
              }`}
              onClick={() => zoneEditor.setMode('draw_lane')}
            >
              <span className="color-dot" style={{ background: '#eab308' }} />
              Approach Lane
            </button>
            <button
              type="button"
              className={`btn btn-compact zone-btn-intersection ${
                zoneEditor.mode === 'draw_intersection' ? 'is-selected' : ''
              }`}
              onClick={() => zoneEditor.setMode('draw_intersection')}
            >
              <span className="color-dot" style={{ background: '#3b82f6' }} />
              Intersection
            </button>
            <button
              type="button"
              className={`btn btn-compact zone-btn-exit ${
                zoneEditor.mode === 'draw_exit_zone' ? 'is-selected' : ''
              }`}
              onClick={() => zoneEditor.setMode('draw_exit_zone')}
            >
              <span className="color-dot" style={{ background: '#f97316' }} />
              Exit Zone
            </button>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Click near the first vertex to auto-complete polygon, or press <strong>Esc</strong> /{' '}
            <strong>Cancel Draw</strong>.
          </span>
        </div>

        {/* 3. Traffic Light */}
        <div className="annotate-section">
          <div className="zone-section-title" style={{ marginBlockEnd: 0 }}>
            Traffic Light
          </div>
          <div className="annotate-tool-grid" role="group" aria-label="Traffic light point tools">
            <button
              type="button"
              className={`btn btn-compact zone-btn-green ${
                zoneEditor.mode === 'place_green_light' ? 'is-selected' : ''
              }`}
              onClick={() => zoneEditor.setMode('place_green_light')}
            >
              <span className="color-dot" style={{ background: '#22c55e' }} />
              Green Light
            </button>
            <button
              type="button"
              className={`btn btn-compact zone-btn-red ${
                zoneEditor.mode === 'place_red_light' ? 'is-selected' : ''
              }`}
              onClick={() => zoneEditor.setMode('place_red_light')}
            >
              <span className="color-dot" style={{ background: '#ef4444' }} />
              Red Light
            </button>
          </div>
        </div>

        {/* 4. Independent Enforcement Rules */}
        <div className="annotate-section">
          <div className="zone-section-title" style={{ marginBlockEnd: 0 }}>
            Enforcement Rules
          </div>

          <label className="crossing-toggle-label" style={{ padding: '0.5rem 0.65rem' }}>
            <input
              type="checkbox"
              checked={zoneEditor.geometry.crossingMode}
              onChange={(e) => zoneEditor.setCrossingMode(e.target.checked)}
            />
            <span>Split-Phase Signal (Require Exit Zone)</span>
          </label>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Requires vehicles to reach an Exit Zone (avoids false flags on protected turns).
          </span>

          <div className="clearance-control-row">
            <label
              className="crossing-toggle-label"
              style={{ padding: '0.5rem 0.65rem', flex: 1 }}
            >
              <input
                type="checkbox"
                checked={hasClearanceGrace}
                onChange={(e) =>
                  zoneEditor.setClearanceSeconds(
                    e.target.checked ? lastClearanceRef.current || 5 : 0
                  )
                }
              />
              <span>Red-Light Clearance Grace</span>
            </label>
            {hasClearanceGrace && (
              <div className="clearance-seconds-wrap">
                <input
                  type="number"
                  min={1}
                  max={15}
                  step={1}
                  aria-label="Clearance grace duration in seconds"
                  className="clearance-seconds-input"
                  value={Math.round(zoneEditor.geometry.clearanceSeconds)}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(parsed)) return;
                    const clamped = Math.max(1, Math.min(15, parsed));
                    lastClearanceRef.current = clamped;
                    zoneEditor.setClearanceSeconds(clamped);
                  }}
                />
                <span>s</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Grants committed slow-moving traffic (1–15s) after green turns red to finish clearing.
          </span>
        </div>

        {/* 5. Current Annotated Stats & Items */}
        <div className="annotate-section">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div className="zone-section-title" style={{ marginBlockEnd: 0 }}>
              Current Annotated
            </div>
            {(zoneEditor.geometry.lanes.length > 0 ||
              zoneEditor.geometry.intersection.length > 0 ||
              zoneEditor.geometry.exitZones.length > 0 ||
              zoneEditor.geometry.lightBoxes.length > 0) && (
              <button
                type="button"
                className="btn btn-compact btn-danger"
                onClick={() => zoneEditor.resetAllZones()}
              >
                Clear All
              </button>
            )}
          </div>

          <div className="annotate-stats-list">
            {zoneEditor.geometry.lanes.map((lane, idx) => (
              <div key={`lane-${idx}`} className="data-row">
                <span>
                  <span
                    className="color-dot"
                    style={{ background: '#eab308', marginInlineEnd: '0.4rem' }}
                  />
                  <strong>Approach {idx + 1}</strong> ({lane.length} pts)
                </span>
                <button
                  type="button"
                  className="btn btn-compact btn-danger"
                  onClick={() => zoneEditor.deleteLane(idx)}
                >
                  Remove
                </button>
              </div>
            ))}

            {zoneEditor.geometry.intersection.length >= 3 && (
              <div className="data-row">
                <span>
                  <span
                    className="color-dot"
                    style={{ background: '#3b82f6', marginInlineEnd: '0.4rem' }}
                  />
                  <strong>Intersection</strong> ({zoneEditor.geometry.intersection.length} pts)
                </span>
                <button
                  type="button"
                  className="btn btn-compact btn-danger"
                  onClick={() => zoneEditor.clearIntersection()}
                >
                  Remove
                </button>
              </div>
            )}

            {zoneEditor.geometry.exitZones.map((ez, idx) => (
              <div key={`exit-${idx}`} className="data-row">
                <span>
                  <span
                    className="color-dot"
                    style={{ background: '#f97316', marginInlineEnd: '0.4rem' }}
                  />
                  <strong>Exit Zone {idx + 1}</strong> ({ez.length} pts)
                </span>
                <button
                  type="button"
                  className="btn btn-compact btn-danger"
                  onClick={() => zoneEditor.deleteExitZone(idx)}
                >
                  Remove
                </button>
              </div>
            ))}

            {zoneEditor.geometry.lightBoxes.map((lb, idx) => (
              <div key={`light-${idx}`} className="data-row">
                <span>
                  <span
                    className="color-dot"
                    style={{
                      background: lb.color === 'green' ? '#22c55e' : '#ef4444',
                      marginInlineEnd: '0.4rem',
                    }}
                  />
                  <strong style={{ textTransform: 'uppercase' }}>{lb.color ?? 'red'} Light</strong> (
                  {lb.x}, {lb.y})
                </span>
                <button
                  type="button"
                  className="btn btn-compact btn-danger"
                  onClick={() => zoneEditor.deleteLightBox(idx)}
                >
                  Remove
                </button>
              </div>
            ))}

            {zoneEditor.geometry.lanes.length === 0 &&
              zoneEditor.geometry.intersection.length < 3 &&
              zoneEditor.geometry.exitZones.length === 0 &&
              zoneEditor.geometry.lightBoxes.length === 0 && (
                <div className="data-row" style={{ color: 'var(--text-muted)' }}>
                  <span>No zones or traffic lights annotated yet.</span>
                </div>
              )}
          </div>
        </div>
      </div>
    </aside>
  );
}
