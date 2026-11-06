import { Point2D, Polygon } from '../types/camera.types';

/**
 * Standard Ray-Casting algorithm to test if a 2D point lies inside a polygon
 */
export function isPointInPolygon(point: Point2D, polygon: Polygon): boolean {
  if (polygon.length < 3) return false;

  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates Euclidean distance between two 2D points
 */
export function pointDistance(p1: Point2D, p2: Point2D): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Checks if a point is within a threshold radius of a vertex
 */
export function isPointNearVertex(p1: Point2D, p2: Point2D, threshold: number = 10): boolean {
  return pointDistance(p1, p2) <= threshold;
}

/**
 * Translates canvas screen display coordinates to native video frame resolution coordinates
 */
export function screenToFrameCoordinates(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  frameWidth: number,
  frameHeight: number
): Point2D {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [screenX, screenY];

  const scaleX = frameWidth / canvasWidth;
  const scaleY = frameHeight / canvasHeight;

  return [Math.round(screenX * scaleX), Math.round(screenY * scaleY)];
}

/**
 * Translates native video frame coordinates to canvas screen display coordinates
 */
export function frameToScreenCoordinates(
  frameX: number,
  frameY: number,
  canvasWidth: number,
  canvasHeight: number,
  frameWidth: number,
  frameHeight: number
): Point2D {
  if (frameWidth <= 0 || frameHeight <= 0) return [frameX, frameY];

  const scaleX = canvasWidth / frameWidth;
  const scaleY = canvasHeight / frameHeight;

  return [frameX * scaleX, frameY * scaleY];
}

/**
 * Computes polygon area using surveyor's formula (Shoelace formula)
 */
export function calculatePolygonArea(polygon: Polygon): number {
  let area = 0;
  const n = polygon.length;
  if (n < 3) return 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i][0] * polygon[j][1];
    area -= polygon[j][0] * polygon[i][1];
  }

  return Math.abs(area) / 2;
}
