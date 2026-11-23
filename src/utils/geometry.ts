import { Point2D } from '../types/camera.types';

function pointDistance(p1: Point2D, p2: Point2D): number {
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
