import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_WIDTH } from '../../config/constants';
import { drawZoneOverlay } from '../../utils/zoneCanvas';
import type { useZoneAnnotation } from '../../hooks/useZoneAnnotation';

type AnnotationHook = ReturnType<typeof useZoneAnnotation>;

interface ZoneEditorCanvasProps {
  annotation: AnnotationHook;
  focusedCameraId: string;
  onOpenSourceDialog: () => void;
}

export function ZoneEditorCanvas({
  annotation,
  focusedCameraId,
  onOpenSourceDialog,
}: ZoneEditorCanvasProps) {
  const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingVertex, setIsDraggingVertex] = useState(false);
  const { zoneEditor, editorSnapshotUrl } = annotation;

  useEffect(() => {
    const canvas = zoneCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawZoneOverlay(ctx, {
      mode: zoneEditor.mode,
      geometry: zoneEditor.geometry,
      activeDrawingPoints: zoneEditor.activeDrawingPoints,
      selectedLaneIndex: zoneEditor.selectedLaneIndex,
      selectedExitIndex: zoneEditor.selectedExitIndex,
      selectedVertex: zoneEditor.selectedVertex,
    });
  }, [
    zoneEditor.mode,
    zoneEditor.geometry,
    zoneEditor.activeDrawingPoints,
    zoneEditor.selectedLaneIndex,
    zoneEditor.selectedExitIndex,
    zoneEditor.selectedVertex,
  ]);

  if (!editorSnapshotUrl) {
    return (
      <div className="stream-placeholder">
        <span>No raw video frame captured yet for {focusedCameraId}</span>
        <span style={{ fontSize: '0.78rem', maxInlineSize: '56ch' }}>
          Open the camera title menu above and choose <strong>Choose Source...</strong> to start a feed and annotate directly over the clean frame.
        </span>
        <button
          type="button"
          className="btn btn-compact btn-active"
          onClick={onOpenSourceDialog}
        >
          Choose Source...
        </button>
      </div>
    );
  }

  return (
    <>
      <img
        className="stream-canvas"
        src={editorSnapshotUrl}
        alt={`Clean annotation frame for ${focusedCameraId}`}
      />
      <canvas
        ref={zoneCanvasRef}
        width={DEFAULT_CAMERA_WIDTH}
        height={DEFAULT_CAMERA_HEIGHT}
        className="zone-canvas-overlay"
        style={{
          cursor:
            zoneEditor.mode === 'select'
              ? isDraggingVertex
                ? 'grabbing'
                : 'grab'
              : 'crosshair',
        }}
        onClick={(e) => {
          if (isDraggingVertex) return;
          const rect = e.currentTarget.getBoundingClientRect();
          zoneEditor.handleCanvasClick(
            e.clientX,
            e.clientY,
            rect,
            DEFAULT_CAMERA_WIDTH,
            DEFAULT_CAMERA_HEIGHT
          );
        }}
        onMouseDown={() => {
          if (zoneEditor.mode === 'select' && zoneEditor.selectedVertex) {
            setIsDraggingVertex(true);
          }
        }}
        onMouseMove={(e) => {
          if (!isDraggingVertex || zoneEditor.mode !== 'select') return;
          const rect = e.currentTarget.getBoundingClientRect();
          zoneEditor.handleVertexDrag(
            e.clientX,
            e.clientY,
            rect,
            DEFAULT_CAMERA_WIDTH,
            DEFAULT_CAMERA_HEIGHT
          );
        }}
        onMouseUp={() => setIsDraggingVertex(false)}
        onMouseLeave={() => setIsDraggingVertex(false)}
        onDoubleClick={(e) => {
          e.preventDefault();
          zoneEditor.finishDrawing();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          zoneEditor.finishDrawing();
        }}
      />
    </>
  );
}
