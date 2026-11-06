import { useState, useCallback, useRef } from 'react';
import { Point2D, Polygon, TrafficLightSamplingBox } from '../types/camera.types';
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

export type EditorMode =
  | 'select'
  | 'draw_lane'
  | 'draw_intersection'
  | 'place_green_light'
  | 'place_red_light';

export function useZoneEditor(initialGeometry?: Partial<ZoneGeometryState>) {
  const [geometry, setGeometry] = useState<ZoneGeometryState>({
    lanes: initialGeometry?.lanes || [],
    intersection: initialGeometry?.intersection || [],
    lightBoxes: (initialGeometry?.lightBoxes as TrafficLightSamplingBox[]) || [],
  });

  const [mode, setMode] = useState<EditorMode>('draw_lane');
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{
    target: 'lane' | 'intersection';
    index: number;
    vertexIndex: number;
  } | null>(null);

  const [activeDrawingPoints, setActiveDrawingPoints] = useState<Point2D[]>([]);

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

  const loadGeometry = useCallback(
    (nextGeometry: ZoneGeometryState) => {
      const cloned: ZoneGeometryState = JSON.parse(JSON.stringify(nextGeometry));
      setGeometry(cloned);
      setActiveDrawingPoints([]);
      setSelectedVertex(null);
      pushHistory(cloned);
    },
    [pushHistory]
  );

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

  const finishDrawing = useCallback(() => {
    if (activeDrawingPoints.length < 3) {
      return false;
    }

    if (mode === 'draw_lane') {
      const updated: ZoneGeometryState = {
        ...geometry,
        lanes: [...geometry.lanes, activeDrawingPoints],
      };
      setGeometry(updated);
      pushHistory(updated);
    } else if (mode === 'draw_intersection') {
      const updated: ZoneGeometryState = {
        ...geometry,
        intersection: activeDrawingPoints,
      };
      setGeometry(updated);
      pushHistory(updated);
    }

    setActiveDrawingPoints([]);
    return true;
  }, [activeDrawingPoints, mode, geometry, pushHistory]);

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
        if (
          activeDrawingPoints.length >= 3 &&
          isPointNearVertex(framePt, activeDrawingPoints[0], 14)
        ) {
          finishDrawing();
          return;
        }
        setActiveDrawingPoints((prev) => [...prev, framePt]);
      } else if (mode === 'place_green_light' || mode === 'place_red_light') {
        const lightColor: 'green' | 'red' = mode === 'place_green_light' ? 'green' : 'red';
        const newLightBoxes: TrafficLightSamplingBox[] = [
          ...geometry.lightBoxes,
          { x: framePt[0], y: framePt[1], color: lightColor },
        ];
        const updated = { ...geometry, lightBoxes: newLightBoxes };
        setGeometry(updated);
        pushHistory(updated);
      } else if (mode === 'select') {
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

        for (let vIdx = 0; vIdx < geometry.intersection.length; vIdx++) {
          if (isPointNearVertex(framePt, geometry.intersection[vIdx], 12)) {
            setSelectedVertex({ target: 'intersection', index: 0, vertexIndex: vIdx });
            return;
          }
        }

        setSelectedVertex(null);
      }
    },
    [mode, activeDrawingPoints, geometry, pushHistory, finishDrawing]
  );

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
        }
        const updatedIntersection = prev.intersection.map((v, vIdx) =>
          vIdx === selectedVertex.vertexIndex ? framePt : v
        );
        return { ...prev, intersection: updatedIntersection };
      });
    },
    [selectedVertex]
  );

  const cancelDrawing = useCallback(() => {
    setActiveDrawingPoints([]);
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

  const deleteLightBox = useCallback(
    (lightIndex: number) => {
      const updated = {
        ...geometry,
        lightBoxes: geometry.lightBoxes.filter((_, idx) => idx !== lightIndex),
      };
      setGeometry(updated);
      pushHistory(updated);
    },
    [geometry, pushHistory]
  );

  const clearIntersection = useCallback(() => {
    const updated = { ...geometry, intersection: [] };
    setGeometry(updated);
    pushHistory(updated);
  }, [geometry, pushHistory]);

  const deleteLastInActiveMode = useCallback(() => {
    if (mode === 'draw_lane' && geometry.lanes.length > 0) {
      deleteLane(geometry.lanes.length - 1);
    } else if (mode === 'draw_intersection' && geometry.intersection.length > 0) {
      clearIntersection();
    } else if (
      (mode === 'place_green_light' || mode === 'place_red_light') &&
      geometry.lightBoxes.length > 0
    ) {
      deleteLightBox(geometry.lightBoxes.length - 1);
    }
  }, [mode, geometry, deleteLane, clearIntersection, deleteLightBox]);

  const resetAllZones = useCallback(() => {
    const empty: ZoneGeometryState = { lanes: [], intersection: [], lightBoxes: [] };
    setGeometry(empty);
    setActiveDrawingPoints([]);
    pushHistory(empty);
  }, [pushHistory]);

  return {
    geometry,
    setGeometry,
    loadGeometry,
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
    deleteLightBox,
    clearIntersection,
    deleteLastInActiveMode,
    resetAllZones,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    screenToFrameCoordinates,
    frameToScreenCoordinates,
  };
}
