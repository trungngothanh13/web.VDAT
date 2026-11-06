import { Polygon } from './camera.types';

export interface BoundingBoxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface VideoResolution {
  width: number;
  height: number;
}

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
}

export type ZoneEditorTool = 'select' | 'draw_lane' | 'draw_intersection' | 'draw_lightbox';

export interface ZoneEditorState {
  currentTool: ZoneEditorTool;
  activeLaneIndex: number | null;
  selectedVertexIndex: number | null;
  isDrawing: boolean;
  lanes: Polygon[];
  intersection: Polygon;
  lightBoxes: Array<{ x: number; y: number; color?: 'red' | 'green' | 'yellow' }>;
  history: Array<{
    lanes: Polygon[];
    intersection: Polygon;
    lightBoxes: Array<{ x: number; y: number; color?: 'red' | 'green' | 'yellow' }>;
  }>;
  historyIndex: number;
}
