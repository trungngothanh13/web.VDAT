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
  exitZones: Polygon[];
  lightBoxes: TrafficLightSamplingBox[];
  crossingMode: boolean;
  clearanceSeconds: number;
}

export type EditorMode =
  | 'select'
  | 'draw_lane'
  | 'draw_intersection'
  | 'draw_exit_zone'
  | 'place_green_light'
  | 'place_red_light';

function normalizeState(initial?: Partial<ZoneGeometryState>): ZoneGeometryState {
  return {
    lanes: initial?.lanes || [],
    intersection: initial?.intersection || [],
    exitZones: initial?.exitZones || [],
    lightBoxes: (initial?.lightBoxes as TrafficLightSamplingBox[]) || [],
    crossingMode: Boolean(initial?.crossingMode),
    clearanceSeconds:
      typeof initial?.clearanceSeconds === 'number' ? initial.clearanceSeconds : 0,
  };
}

export function useZoneEditor(initialGeometry?: Partial<ZoneGeometryState>) {
  const initialState = normalizeState(initialGeometry);
  const [geometry, setGeometry] = useState<ZoneGeometryState>(initialState);

  const [mode, setMode] = useState<EditorMode>('draw_lane');
  const [selectedLaneIndex, setSelectedLaneIndex] = useState<number | null>(null);
  const [selectedExitIndex, setSelectedExitIndex] = useState<number | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<{
    target: 'lane' | 'intersection' | 'exit_zone';
    index: number;
    vertexIndex: number;
  } | null>(null);

  const [activeDrawingPoints, setActiveDrawingPoints] = useState<Point2D[]>([]);

  const historyRef = useRef<ZoneGeometryState[]>([JSON.parse(JSON.stringify(initialState))]);
  const historyIndexRef = useRef(0);

  const pushHistory = useCallback((newState: ZoneGeometryState) => {
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(newState)));
    historyIndexRef.current = historyRef.current.length - 1;
  }, []);

  const loadGeometry = useCallback((nextGeometry: Partial<ZoneGeometryState>) => {
    const normalized = normalizeState(nextGeometry);
    const cloned: ZoneGeometryState = JSON.parse(JSON.stringify(normalized));
    setGeometry(cloned);
    setActiveDrawingPoints([]);
    setSelectedVertex(null);
    setSelectedLaneIndex(null);
    setSelectedExitIndex(null);
    historyRef.current = [JSON.parse(JSON.stringify(cloned))];
    historyIndexRef.current = 0;
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
    } else if (mode === 'draw_exit_zone') {
      const updated: ZoneGeometryState = {
        ...geometry,
        exitZones: [...geometry.exitZones, activeDrawingPoints],
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

      if (mode === 'draw_lane' || mode === 'draw_intersection' || mode === 'draw_exit_zone') {
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

        for (let eIdx = 0; eIdx < geometry.exitZones.length; eIdx++) {
          const ez = geometry.exitZones[eIdx];
          for (let vIdx = 0; vIdx < ez.length; vIdx++) {
            if (isPointNearVertex(framePt, ez[vIdx], 12)) {
              setSelectedVertex({ target: 'exit_zone', index: eIdx, vertexIndex: vIdx });
              setSelectedExitIndex(eIdx);
              return;
            }
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
          const updatedLanes = prev.lanes.map((lane, lIdx) =>
            lIdx === selectedVertex.index
              ? lane.map((v, vIdx) => (vIdx === selectedVertex.vertexIndex ? framePt : v))
              : lane
          );
          return { ...prev, lanes: updatedLanes };
        }
        if (selectedVertex.target === 'exit_zone') {
          const updatedExits = prev.exitZones.map((ez, eIdx) =>
            eIdx === selectedVertex.index
              ? ez.map((v, vIdx) => (vIdx === selectedVertex.vertexIndex ? framePt : v))
              : ez
          );
          return { ...prev, exitZones: updatedExits };
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

  const changeMode = useCallback(
    (nextMode: EditorMode) => {
      if (activeDrawingPoints.length >= 3) {
        finishDrawing();
      } else if (activeDrawingPoints.length > 0) {
        setActiveDrawingPoints([]);
      }
      setMode(nextMode);
    },
    [activeDrawingPoints.length, finishDrawing]
  );

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

  const deleteExitZone = useCallback(
    (exitIndex: number) => {
      const updated = {
        ...geometry,
        exitZones: geometry.exitZones.filter((_, idx) => idx !== exitIndex),
      };
      setGeometry(updated);
      pushHistory(updated);
      if (selectedExitIndex === exitIndex) {
        setSelectedExitIndex(null);
      }
    },
    [geometry, selectedExitIndex, pushHistory]
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

  const setCrossingMode = useCallback(
    (crossingMode: boolean) => {
      const updated = { ...geometry, crossingMode };
      setGeometry(updated);
      pushHistory(updated);
    },
    [geometry, pushHistory]
  );

  const setClearanceSeconds = useCallback(
    (clearanceSeconds: number) => {
      const updated = { ...geometry, clearanceSeconds };
      setGeometry(updated);
      pushHistory(updated);
    },
    [geometry, pushHistory]
  );

  const deleteLastInActiveMode = useCallback(() => {
    if (mode === 'draw_lane' && geometry.lanes.length > 0) {
      deleteLane(geometry.lanes.length - 1);
    } else if (mode === 'draw_intersection' && geometry.intersection.length > 0) {
      clearIntersection();
    } else if (mode === 'draw_exit_zone' && geometry.exitZones.length > 0) {
      deleteExitZone(geometry.exitZones.length - 1);
    } else if (
      (mode === 'place_green_light' || mode === 'place_red_light') &&
      geometry.lightBoxes.length > 0
    ) {
      deleteLightBox(geometry.lightBoxes.length - 1);
    }
  }, [mode, geometry, deleteLane, clearIntersection, deleteExitZone, deleteLightBox]);

  const resetAllZones = useCallback(() => {
    const empty: ZoneGeometryState = {
      lanes: [],
      intersection: [],
      exitZones: [],
      lightBoxes: [],
      crossingMode: geometry.crossingMode,
      clearanceSeconds: geometry.clearanceSeconds,
    };
    setGeometry(empty);
    setActiveDrawingPoints([]);
    pushHistory(empty);
  }, [geometry.crossingMode, geometry.clearanceSeconds, pushHistory]);

  return {
    geometry,
    setGeometry,
    loadGeometry,
    mode,
    setMode: changeMode,
    activeDrawingPoints,
    selectedLaneIndex,
    setSelectedLaneIndex,
    selectedExitIndex,
    setSelectedExitIndex,
    selectedVertex,
    setSelectedVertex,
    handleCanvasClick,
    handleVertexDrag,
    finishDrawing,
    cancelDrawing,
    deleteLane,
    deleteExitZone,
    deleteLightBox,
    clearIntersection,
    setCrossingMode,
    setClearanceSeconds,
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
