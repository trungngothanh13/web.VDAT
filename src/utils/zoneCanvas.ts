import { DEFAULT_CAMERA_HEIGHT, DEFAULT_CAMERA_WIDTH } from '../config/constants';
import type { EditorMode, ZoneGeometryState } from '../hooks/useZoneEditor';
import type { Point2D } from '../types/camera.types';

interface ZoneOverlayDrawState {
  mode: EditorMode;
  geometry: ZoneGeometryState;
  activeDrawingPoints: Point2D[];
  selectedLaneIndex: number | null;
  selectedExitIndex: number | null;
  selectedVertex: {
    target: 'lane' | 'intersection' | 'exit_zone';
    index: number;
    vertexIndex: number;
  } | null;
}

export function drawZoneOverlay(ctx: CanvasRenderingContext2D, state: ZoneOverlayDrawState): void {
  const {
    mode,
    geometry,
    activeDrawingPoints,
    selectedLaneIndex,
    selectedExitIndex,
    selectedVertex,
  } = state;

  ctx.clearRect(0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);

  // 1. Draw Approach Lanes (Yellow)
  geometry.lanes.forEach((lane, idx) => {
    if (lane.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(lane[0][0], lane[0][1]);
    for (let i = 1; i < lane.length; i++) {
      ctx.lineTo(lane[i][0], lane[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle =
      selectedLaneIndex === idx ? 'rgba(234, 179, 8, 0.32)' : 'rgba(234, 179, 8, 0.18)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#eab308';
    ctx.stroke();

    lane.forEach((pt, vIdx) => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        selectedVertex?.target === 'lane' &&
        selectedVertex.index === idx &&
        selectedVertex.vertexIndex === vIdx
          ? '#ffffff'
          : '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(`Approach ${idx + 1}`, lane[0][0] + 6, lane[0][1] - 6);
  });

  // 2. Draw Intersection polygon (Blue)
  const inter = geometry.intersection;
  if (inter.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(inter[0][0], inter[0][1]);
    for (let i = 1; i < inter.length; i++) {
      ctx.lineTo(inter[i][0], inter[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.22)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3b82f6';
    ctx.stroke();

    inter.forEach((pt, vIdx) => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        selectedVertex?.target === 'intersection' && selectedVertex.vertexIndex === vIdx
          ? '#ffffff'
          : '#60a5fa';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('Intersection', inter[0][0] + 6, inter[0][1] - 6);
  }

  // 3. Draw Exit Zones (Orange)
  geometry.exitZones.forEach((ez, idx) => {
    if (ez.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(ez[0][0], ez[0][1]);
    for (let i = 1; i < ez.length; i++) {
      ctx.lineTo(ez[i][0], ez[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle =
      selectedExitIndex === idx ? 'rgba(249, 115, 22, 0.34)' : 'rgba(249, 115, 22, 0.20)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f97316';
    ctx.stroke();

    ez.forEach((pt, vIdx) => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle =
        selectedVertex?.target === 'exit_zone' &&
        selectedVertex.index === idx &&
        selectedVertex.vertexIndex === vIdx
          ? '#ffffff'
          : '#fb923c';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = '#fdba74';
    ctx.fillText(`Exit Zone ${idx + 1}`, ez[0][0] + 6, ez[0][1] - 6);
  });

  // 4. Draw Traffic Light points as small unobstructed solid dots
  geometry.lightBoxes.forEach((lb) => {
    const isGreen = lb.color === 'green';
    ctx.beginPath();
    ctx.arc(lb.x, lb.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isGreen ? '#22c55e' : '#ef4444';
    ctx.fill();
  });

  // 5. Draw in-progress polygon points (synced with active lane color + snap ring on first vertex)
  if (activeDrawingPoints.length > 0) {
    const strokeColor =
      mode === 'draw_lane'
        ? '#eab308'
        : mode === 'draw_intersection'
          ? '#3b82f6'
          : mode === 'draw_exit_zone'
            ? '#f97316'
            : '#06b6d4';

    ctx.beginPath();
    ctx.moveTo(activeDrawingPoints[0][0], activeDrawingPoints[0][1]);
    for (let i = 1; i < activeDrawingPoints.length; i++) {
      ctx.lineTo(activeDrawingPoints[i][0], activeDrawingPoints[i][1]);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (activeDrawingPoints.length >= 3) {
      ctx.beginPath();
      ctx.arc(activeDrawingPoints[0][0], activeDrawingPoints[0][1], 12, 0, Math.PI * 2);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    activeDrawingPoints.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], idx === 0 ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = idx === 0 ? strokeColor : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    });
  }
}
