import { useState, useCallback, useRef } from 'react';
import { Point2D, Polygon } from '../types/camera.types';
import { TrafficLightSamplingBox } from '../types/camera.types';
import {
  isPointNearVertex,
  screenToFrameCoordinates,
  frameToScreenCoordinates,
} from '../utils/geometry';

export interface ZoneGeometryState {
  lanes: Polygon[];
  intersection: Polygon;
  lightBoxes: TrafficLightSamplingBox[];
}

export type EditorMode = 'select' | 'draw_lane' | 'draw_intersection' | 'place_light';

export function useZoneEditor(initialGeometry?: Partial<ZoneGeometryState>) {
  const [geometry, setGeometry] = useState<ZoneGeometryState>({
    lanes: initialGeometry?.lanes || [],
    intersection: initialGeometry?.intersection || [],
    lightBoxes: (initialGeometry?.lightBoxes as TrafficLightSamplingBox[]) || [],
  });

  const [mode, setMode] = useState<EditorMode>('select');
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{
    target: 'lane' | 'intersection';
    index: number;
    vertexIndex: number;
  } | null>(null);

  const [activeDrawingPoints, setActiveDrawingPoints] = useState<Point2D[]>([]);

  // History stack for undo/redo
  const historyRef = useRef<ZoneGeometryState[]>([
    {
      lanes: initialGeometry?.lanes || [],
      intersection: initialGeometry?.intersection || [],
      lightBoxes: (initialGeometry?.lightBoxes as TrafficLightSamplingBox[]) || [],
    },
  ]);
  const historyIndexRef = useRef(0);

  const pushHistory = useCallback((newState: ZoneGeometryState) => {
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(newState)));
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prevState = historyRef.current[historyIndexRef.current];
      setGeometry(JSON.parse(JSON.stringify(prevState)));
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const nextState = historyRef.current[historyIndexRef.current];
      setGeometry(JSON.parse(JSON.stringify(nextState)));
    }
  }, []);

  /**
   * Handle canvas click to add points or select vertices
   */
  const handleCanvasClick = useCallback(
    (
      screenX: number,
      screenY: number,
      canvasRect: DOMRect,
      frameWidth: number,
      frameHeight: number
    ) => {
      const framePt = screenToFrameCoordinates(
        screenX - canvasRect.left,
        screenY - canvasRect.top,
        canvasRect.width,
        canvasRect.height,
        frameWidth,
        frameHeight
      );

      if (mode === 'draw_lane' || mode === 'draw_intersection') {
        // If clicking near first point, close polygon
        if (
          activeDrawingPoints.length >= 3 &&
          isPointNearVertex(framePt, activeDrawingPoints[0], 15)
        ) {
          finishDrawing();
          return;
        }

        setActiveDrawingPoints((prev) => [...prev, framePt]);
      } else if (mode === 'place_light') {
        const newLightBoxes = [...geometry.lightBoxes, { x: framePt[0], y: framePt[1], color: 'red' as const }];
        const updated = { ...geometry, lightBoxes: newLightBoxes };
        setGeometry(updated);
        pushHistory(updated);
        setMode('select');
      } else if (mode === 'select') {
        // Test if clicked near any vertex
        // Check lanes
        for (let lIdx = 0; lIdx < geometry.lanes.length; lIdx++) {
          const lane = geometry.lanes[lIdx];
          for (let vIdx = 0; vIdx < lane.length; vIdx++) {
            if (isPointNearVertex(framePt, lane[vIdx], 12)) {
              setSelectedVertex({ target: 'lane', index: lIdx, vertexIndex: vIdx });
              setSelectedLaneIndex(lIdx);
              return;
            }
          }
        }

        // Check intersection
        for (let vIdx = 0; vIdx < geometry.intersection.length; vIdx++) {
          if (isPointNearVertex(framePt, geometry.intersection[vIdx], 12)) {
            setSelectedVertex({ target: 'intersection', index: 0, vertexIndex: vIdx });
            return;
          }
        }

        // Clicked on empty space
        setSelectedVertex(null);
      }
    },
    [mode, activeDrawingPoints, geometry, pushHistory]
  );

  /**
   * Move selected vertex during drag
   */
  const handleVertexDrag = useCallback(
    (
      screenX: number,
      screenY: number,
      canvasRect: DOMRect,
      frameWidth: number,
      frameHeight: number
    ) => {
      if (!selectedVertex) return;

      const framePt = screenToFrameCoordinates(
        screenX - canvasRect.left,
        screenY - canvasRect.top,
        canvasRect.width,
        canvasRect.height,
        frameWidth,
        frameHeight
      );

      setGeometry((prev) => {
        if (selectedVertex.target === 'lane') {
          const updatedLanes = prev.lanes.map((lane, lIdx) => {
            if (lIdx === selectedVertex.index) {
              return lane.map((v, vIdx) => (vIdx === selectedVertex.vertexIndex ? framePt : v));
            }
            return lane;
          });
          return { ...prev, lanes: updatedLanes };
        } else {
          const updatedIntersection = prev.intersection.map((v, vIdx) =>
            vIdx === selectedVertex.vertexIndex ? framePt : v
          );
          return { ...prev, intersection: updatedIntersection };
        }
      });
    },
    [selectedVertex]
  );

  const finishDrawing = useCallback(() => {
    if (activeDrawingPoints.length < 3) {
      setActiveDrawingPoints([]);
      setMode('select');
      return;
    }

    if (mode === 'draw_lane') {
      const updated = {
        ...geometry,
        lanes: [...geometry.lanes, activeDrawingPoints],
      };
      setGeometry(updated);
      pushHistory(updated);
    } else if (mode === 'draw_intersection') {
      const updated = {
        ...geometry,
        intersection: activeDrawingPoints,
      };
      setGeometry(updated);
      pushHistory(updated);
    }

    setActiveDrawingPoints([]);
    setMode('select');
  }, [activeDrawingPoints, mode, geometry, pushHistory]);

  const cancelDrawing = useCallback(() => {
    setActiveDrawingPoints([]);
    setMode('select');
  }, []);

  const deleteLane = useCallback(
    (laneIndex: number) => {
      const updated = {
        ...geometry,
        lanes: geometry.lanes.filter((_, idx) => idx !== laneIndex),
      };
      setGeometry(updated);
      pushHistory(updated);
      if (selectedLaneIndex === laneIndex) {
        setSelectedLaneIndex(null);
      }
    },
    [geometry, selectedLaneIndex, pushHistory]
  );

  const clearIntersection = useCallback(() => {
    const updated = { ...geometry, intersection: [] };
    setGeometry(updated);
    pushHistory(updated);
  }, [geometry, pushHistory]);

  const resetAllZones = useCallback(() => {
    const empty: ZoneGeometryState = { lanes: [], intersection: [], lightBoxes: [] };
    setGeometry(empty);
    pushHistory(empty);
  }, [pushHistory]);

  return {
    geometry,
    setGeometry,
    mode,
    setMode,
    activeDrawingPoints,
    selectedLaneIndex,
    setSelectedLaneIndex,
    selectedVertex,
    setSelectedVertex,
    handleCanvasClick,
    handleVertexDrag,
    finishDrawing,
    cancelDrawing,
    deleteLane,
    clearIntersection,
    resetAllZones,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    screenToFrameCoordinates,
    frameToScreenCoordinates,
  };
}

