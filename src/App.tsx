import React, { useEffect, useRef, useState } from 'react';
import {
  useAuth,
  useLiveStream,
  useViolationAlerts,
  useViolations,
  useReviewViolation,
  useOverviewStats,
  useCameras,
  useCreateCamera,
  useDeleteCameras,
  useUpdateZones,
  useZoneEditor,
  useAudioAlert,
  useMultiCameraTransmitter,
} from './hooks';
import { evidenceApi } from './api/evidence.api';
import { vdatWsClient } from './websocket/client';
import { exportViolationsToCsv } from './utils/export';
import { formatConfidence, formatDateTime, formatShortRelativeTime } from './utils/formatters';
import {
  VIOLATION_STATUS_CONFIG,
  getLightConfig,
  DEFAULT_CAMERA_WIDTH,
  DEFAULT_CAMERA_HEIGHT,
} from './config/constants';
import { Violation, ViolationStatus } from './types/violation.types';
import { TrafficLightSamplingBox } from './types/camera.types';
import './styles/dashboard.css';

const EXPIRED_THUMB_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 68">' +
      '<rect width="108" height="68" fill="#0f172a"/>' +
      '<rect x="3" y="3" width="102" height="62" rx="4" fill="none" stroke="#334155" stroke-dasharray="4 3" stroke-width="1"/>' +
      '<circle cx="54" cy="24" r="9" fill="none" stroke="#f59e0b" stroke-width="1.6"/>' +
      '<path d="M54 19v5l3 2" fill="none" stroke="#f59e0b" stroke-width="1.6" stroke-linecap="round"/>' +
      '<text x="54" y="49" fill="#fcd34d" font-family="Inter,sans-serif" font-size="9.5" font-weight="700" letter-spacing="0.8" text-anchor="middle">EXPIRED</text>' +
      '</svg>'
  );

function bindDialogLightDismissFallback(dialog: HTMLDialogElement | null) {
  if (!dialog || typeof HTMLDialogElement === 'undefined') return () => {};
  if ('closedBy' in HTMLDialogElement.prototype) return () => {};

  const outside = (event: PointerEvent) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  let pressedOutside = false;
  const handlePointerDown = (event: PointerEvent) => {
    pressedOutside = outside(event);
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (pressedOutside && outside(event)) {
      dialog.close();
    }
    pressedOutside = false;
  };

  dialog.addEventListener('pointerdown', handlePointerDown);
  dialog.addEventListener('pointerup', handlePointerUp);
  return () => {
    dialog.removeEventListener('pointerdown', handlePointerDown);
    dialog.removeEventListener('pointerup', handlePointerUp);
  };
}

export function App() {
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics'>('monitor');
  const [statusFilter, setStatusFilter] = useState<ViolationStatus | undefined>(undefined);
  const [cameraFilter, setCameraFilter] = useState<string | undefined>(undefined);
  const [activeEvidence, setActiveEvidence] = useState<{
    violation: Violation;
    mediaTab: 'video' | 'snapshot';
  } | null>(null);
  const [videoMediaExpired, setVideoMediaExpired] = useState(false);
  const [snapshotMediaExpired, setSnapshotMediaExpired] = useState(false);

  // Multi-camera Add / Delete dialog state (Admin)
  const [newCamId, setNewCamId] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamLocation, setNewCamLocation] = useState('');
  const [addCameraError, setAddCameraError] = useState<string | null>(null);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [deleteCameraError, setDeleteCameraError] = useState<string | null>(null);

  // Sign-In Form State
  const [email, setEmail] = useState('admin@vdat.local');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);

  // In-Place Zone Annotation State
  const [isAnnotatingZones, setIsAnnotatingZones] = useState(false);
  const [editorSnapshotUrl, setEditorSnapshotUrl] = useState<string | null>(null);
  const [zoneSyncBanner, setZoneSyncBanner] = useState<string | null>(null);
  const [isDraggingVertex, setIsDraggingVertex] = useState(false);

  // Protected hooks only connect/fetch when authenticated
  const stream = useLiveStream({ autoConnect: auth.isAuthenticated });
  const transmitters = useMultiCameraTransmitter();
  const focusedCameraId = stream.selectedCameraId || 'cam-01';
  const focusedChannel = transmitters.getChannel(focusedCameraId);
  const focusedFileInputRef = useRef<HTMLInputElement>(null);
  const alerts = useViolationAlerts();
  const audio = useAudioAlert();

  // Camera title dropdown popover, user header popover & Choose/Change Source modal dialog refs
  const camMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const camMenuPopoverRef = useRef<HTMLDivElement>(null);
  const camMenuGroupRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const userMenuPopoverRef = useRef<HTMLDivElement>(null);
  const userMenuGroupRef = useRef<HTMLDivElement>(null);
  const sourceDialogRef = useRef<HTMLDialogElement>(null);
  const manageCamerasDialogRef = useRef<HTMLDialogElement>(null);
  const [isCamMenuOpen, setIsCamMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const camMenuEnterOnOpenRef = useRef(false);
  const userMenuEnterOnOpenRef = useRef(false);
  const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());

  // Keep "? mins ago" relative labels fresh automatically
  useEffect(() => {
    const timer = setInterval(() => setRelativeNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Auto-filter Violation Evidence sidebar to whichever camera the operator focuses on
  useEffect(() => {
    setCameraFilter(focusedCameraId);
  }, [focusedCameraId]);

  const violationsQuery = useViolations(
    {
      page: 1,
      limit: 50,
      status: statusFilter,
      cameraId: cameraFilter,
    },
    auth.isAuthenticated
  );
  const reviewMutation = useReviewViolation();
  const statsQuery = useOverviewStats(15000, auth.isAuthenticated);
  const camerasQuery = useCameras(auth.isAuthenticated);
  const createCameraMutation = useCreateCamera();
  const deleteCamerasMutation = useDeleteCameras();
  const updateZonesMutation = useUpdateZones();

  const zoneEditor = useZoneEditor();
  const zoneCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveStreamCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasLiveCanvasFrame, setHasLiveCanvasFrame] = useState(false);
  const isStreamPausedRef = useRef(stream.isPaused);
  isStreamPausedRef.current = stream.isPaused;
  const initializedCameraConfigRef = useRef<string | null>(null);
  const initializedCameraSourceRef = useRef<string | null>(null);

  const evidenceDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const cleanEvidenceDialog = bindDialogLightDismissFallback(evidenceDialogRef.current);
    const cleanSourceDialog = bindDialogLightDismissFallback(sourceDialogRef.current);
    const cleanManageCamerasDialog = bindDialogLightDismissFallback(manageCamerasDialogRef.current);
    return () => {
      cleanEvidenceDialog();
      cleanSourceDialog();
      cleanManageCamerasDialog();
    };
  }, [auth.isAuthenticated]);

  // Reusable native popover menu binding (Invoker Command, focusgroup & anchor-positioning fallbacks)
  useEffect(() => {
    const bindMenu = (
      trigger: HTMLButtonElement | null,
      pop: HTMLDivElement | null,
      group: HTMLDivElement | null,
      alignEnd: boolean,
      setOpen: (open: boolean) => void,
      enterRef: React.MutableRefObject<boolean>
    ) => {
      if (!pop || !trigger || !group) return () => {};

      const getMenuItems = () =>
        Array.from(group.querySelectorAll<HTMLButtonElement>('button')).filter(
          (btn) => !btn.disabled && btn.getAttribute('aria-disabled') !== 'true'
        );

      const positionPopoverFallback = () => {
        if (typeof CSS !== 'undefined' && CSS.supports('position-area: block-end')) return;
        const rect = trigger.getBoundingClientRect();
        const popRect = pop.getBoundingClientRect();
        const gap = 6;
        const spaceBelow = window.innerHeight - rect.bottom - gap;
        const top =
          spaceBelow >= popRect.height || rect.top < popRect.height
            ? Math.min(rect.bottom + gap, Math.max(8, window.innerHeight - popRect.height - 8))
            : Math.max(8, rect.top - popRect.height - gap);
        const rawLeft = alignEnd ? rect.right - popRect.width : rect.left;
        const left = Math.min(
          Math.max(8, rawLeft),
          Math.max(8, window.innerWidth - popRect.width - 8)
        );
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
      };

      const handleToggle = (event: Event) => {
        const nextOpen = (event as ToggleEvent).newState === 'open';
        setOpen(nextOpen);
        if (nextOpen) {
          positionPopoverFallback();
          if (enterRef.current) {
            enterRef.current = false;
            getMenuItems()[0]?.focus({ preventScroll: true });
          }
        }
      };

      const hasNativeFocusgroup = 'focusGroup' in HTMLElement.prototype;
      if (!hasNativeFocusgroup) {
        group.setAttribute('role', 'menu');
        group.querySelectorAll('button:not([role])').forEach((btn) => {
          btn.setAttribute('role', 'menuitem');
        });
      }

      const handleGroupKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Tab') {
          try {
            pop.hidePopover();
          } catch {
            // Ignore
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          try {
            pop.hidePopover();
          } catch {
            // Ignore
          }
          trigger.focus({ preventScroll: true });
          return;
        }
        if (hasNativeFocusgroup) return;
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = getMenuItems();
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : current < 0
                ? 0
                : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        event.preventDefault();
        event.stopImmediatePropagation();
        items[next].focus({ preventScroll: true });
      };

      const handleTriggerKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          enterRef.current = true;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (!pop.matches(':popover-open')) {
            trigger.click();
          } else {
            getMenuItems()[0]?.focus({ preventScroll: true });
          }
        }
      };

      const handlePointerMove = (event: PointerEvent) => {
        const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
        if (
          target &&
          group.contains(target) &&
          !target.disabled &&
          document.activeElement !== target
        ) {
          target.focus({ preventScroll: true });
        }
      };

      const handleDocumentFocusIn = (event: FocusEvent) => {
        if (!pop.matches(':popover-open')) return;
        const target = event.target as Node | null;
        if (target && !pop.contains(target) && target !== trigger) {
          try {
            pop.hidePopover();
          } catch {
            // Ignore
          }
        }
      };

      pop.addEventListener('toggle', handleToggle);
      group.addEventListener('keydown', handleGroupKeyDown, true);
      group.addEventListener('pointermove', handlePointerMove);
      trigger.addEventListener('keydown', handleTriggerKeyDown);
      document.addEventListener('focusin', handleDocumentFocusIn);

      return () => {
        pop.removeEventListener('toggle', handleToggle);
        group.removeEventListener('keydown', handleGroupKeyDown, true);
        group.removeEventListener('pointermove', handlePointerMove);
        trigger.removeEventListener('keydown', handleTriggerKeyDown);
        document.removeEventListener('focusin', handleDocumentFocusIn);
      };
    };

    const cleanCam = bindMenu(
      camMenuTriggerRef.current,
      camMenuPopoverRef.current,
      camMenuGroupRef.current,
      false,
      setIsCamMenuOpen,
      camMenuEnterOnOpenRef
    );
    const cleanUser = bindMenu(
      userMenuTriggerRef.current,
      userMenuPopoverRef.current,
      userMenuGroupRef.current,
      true,
      setIsUserMenuOpen,
      userMenuEnterOnOpenRef
    );
    return () => {
      cleanCam();
      cleanUser();
    };
  }, [auth.isAuthenticated, activeTab, focusedChannel.sourceType, focusedChannel.isBroadcasting]);

  // Press Escape while annotating to cancel the current in-progress polygon
  useEffect(() => {
    if (!isAnnotatingZones) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (
        sourceDialogRef.current?.open ||
        evidenceDialogRef.current?.open ||
        manageCamerasDialogRef.current?.open
      ) {
        return;
      }
      if (zoneEditor.activeDrawingPoints.length > 0) {
        event.preventDefault();
        zoneEditor.cancelDrawing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAnnotatingZones, zoneEditor]);

  const camMenuSpacePressedRef = useRef(false);
  const handleCheckboxMenuKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') {
      camMenuSpacePressedRef.current = true;
    }
  };
  const closePopoverEl = (pop: HTMLDivElement | null, delayMs: number = 0) => {
    const hide = () => {
      try {
        pop?.hidePopover();
      } catch {
        // Ignore if already closed
      }
    };
    if (delayMs > 0) {
      setTimeout(hide, delayMs);
    } else {
      hide();
    }
  };
  const closeCamMenu = (delayMs: number = 0) => closePopoverEl(camMenuPopoverRef.current, delayMs);
  const closeUserMenu = (delayMs: number = 0) =>
    closePopoverEl(userMenuPopoverRef.current, delayMs);

  const closeAfterCheckboxAction = (pop: HTMLDivElement | null = camMenuPopoverRef.current) => {
    if (camMenuSpacePressedRef.current) {
      camMenuSpacePressedRef.current = false;
      return; // APG: Space toggles a menuitemcheckbox and leaves the menu open
    }
    closePopoverEl(pop, 250);
  };

  const handlePopoverTriggerClickFallback = (pop: HTMLDivElement | null) => {
    if (
      typeof HTMLButtonElement !== 'undefined' &&
      'commandForElement' in HTMLButtonElement.prototype
    ) {
      return;
    }
    if (!pop) return;
    try {
      pop.togglePopover();
    } catch {
      // Ignore if unsupported
    }
  };

  const openSourceDialog = () => {
    closeCamMenu(0);
    const dialog = sourceDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  const closeSourceDialog = () => {
    const dialog = sourceDialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    }
  };

  const openManageCamerasDialog = () => {
    setAddCameraError(null);
    setDeleteCameraError(null);
    setSelectedDeleteIds([]);
    const dialog = manageCamerasDialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  };

  const closeManageCamerasDialog = () => {
    const dialog = manageCamerasDialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    }
  };

  // Sync in-place Zone Editor state cleanly when focused camera or active ZoneProfile changes
  const currentCamera =
    camerasQuery.data?.find((c) => c.id === focusedCameraId) ?? camerasQuery.data?.[0];

  useEffect(() => {
    if (!currentCamera) return;
    const cfg = currentCamera.config;
    const effectiveSourceKey = cfg?.sourceKey ?? currentCamera.activeSourceKey ?? 'none';
    const sourceSessionKey = `${currentCamera.id}-${effectiveSourceKey}`;
    const configKey = `${sourceSessionKey}-v${cfg?.version ?? 0}`;

    // Preserve active in-place edits if camerasQuery refetches in the background for the same source
    if (isAnnotatingZones && initializedCameraSourceRef.current === sourceSessionKey) {
      return;
    }
    if (initializedCameraConfigRef.current === configKey) return;

    initializedCameraSourceRef.current = sourceSessionKey;
    initializedCameraConfigRef.current = configKey;

    if (!cfg) {
      zoneEditor.loadGeometry({
        lanes: [],
        intersection: [],
        exitZones: [],
        lightBoxes: [],
        crossingMode: false,
        clearanceSeconds: 3.0,
      });
      return;
    }

    const rawLightBox = cfg.lightBox;
    const lightBoxes: TrafficLightSamplingBox[] = Array.isArray(rawLightBox)
      ? (rawLightBox as TrafficLightSamplingBox[])
      : [];

    zoneEditor.loadGeometry({
      lanes: Array.isArray(cfg.lanes) ? cfg.lanes : [],
      intersection: Array.isArray(cfg.intersection) ? cfg.intersection : [],
      exitZones: Array.isArray(cfg.exitZones) ? cfg.exitZones : [],
      lightBoxes,
      crossingMode: Boolean(cfg.crossingMode),
      clearanceSeconds: typeof cfg.clearanceSeconds === 'number' ? cfg.clearanceSeconds : 3.0,
    });
  }, [currentCamera, isAnnotatingZones, zoneEditor]);

  // Capture a clean raw frame automatically as soon as the video source starts while annotating
  useEffect(() => {
    if (isAnnotatingZones && !editorSnapshotUrl && focusedChannel.transmittedFrames >= 1) {
      const snap = transmitters.getChannelSnapshot(focusedCameraId);
      if (snap) setEditorSnapshotUrl(snap);
    }
  }, [
    isAnnotatingZones,
    editorSnapshotUrl,
    focusedChannel.transmittedFrames,
    focusedCameraId,
    transmitters,
  ]);

  // Draw Zone Editor overlays onto <canvas>
  useEffect(() => {
    if (activeTab !== 'monitor' || !isAnnotatingZones) return;
    const canvas = zoneCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT);

    // 1. Draw Approach Lanes (Yellow)
    zoneEditor.geometry.lanes.forEach((lane, idx) => {
      if (lane.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(lane[0][0], lane[0][1]);
      for (let i = 1; i < lane.length; i++) {
        ctx.lineTo(lane[i][0], lane[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle =
        zoneEditor.selectedLaneIndex === idx
          ? 'rgba(234, 179, 8, 0.32)'
          : 'rgba(234, 179, 8, 0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#eab308';
      ctx.stroke();

      lane.forEach((pt, vIdx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle =
          zoneEditor.selectedVertex?.target === 'lane' &&
          zoneEditor.selectedVertex.index === idx &&
          zoneEditor.selectedVertex.vertexIndex === vIdx
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
    const inter = zoneEditor.geometry.intersection;
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
          zoneEditor.selectedVertex?.target === 'intersection' &&
          zoneEditor.selectedVertex.vertexIndex === vIdx
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
    zoneEditor.geometry.exitZones.forEach((ez, idx) => {
      if (ez.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(ez[0][0], ez[0][1]);
      for (let i = 1; i < ez.length; i++) {
        ctx.lineTo(ez[i][0], ez[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle =
        zoneEditor.selectedExitIndex === idx
          ? 'rgba(249, 115, 22, 0.34)'
          : 'rgba(249, 115, 22, 0.20)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f97316';
      ctx.stroke();

      ez.forEach((pt, vIdx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 4.5, 0, Math.PI * 2);
        ctx.fillStyle =
          zoneEditor.selectedVertex?.target === 'exit_zone' &&
          zoneEditor.selectedVertex.index === idx &&
          zoneEditor.selectedVertex.vertexIndex === vIdx
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
    zoneEditor.geometry.lightBoxes.forEach((lb) => {
      const isGreen = lb.color === 'green';
      const dotColor = isGreen ? '#22c55e' : '#ef4444';

      ctx.beginPath();
      ctx.arc(lb.x, lb.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    });

    // 5. Draw in-progress polygon points (synced with active lane color + snap ring on first vertex)
    const activePts = zoneEditor.activeDrawingPoints;
    if (activePts.length > 0) {
      const strokeColor =
        zoneEditor.mode === 'draw_lane'
          ? '#eab308'
          : zoneEditor.mode === 'draw_intersection'
            ? '#3b82f6'
            : zoneEditor.mode === 'draw_exit_zone'
              ? '#f97316'
              : '#06b6d4';

      ctx.beginPath();
      ctx.moveTo(activePts[0][0], activePts[0][1]);
      for (let i = 1; i < activePts.length; i++) {
        ctx.lineTo(activePts[i][0], activePts[i][1]);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Visual snap target around first point when >= 3 points so click-to-close is obvious
      if (activePts.length >= 3) {
        ctx.beginPath();
        ctx.arc(activePts[0][0], activePts[0][1], 12, 0, Math.PI * 2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      activePts.forEach((pt, idx) => {
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], idx === 0 ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? strokeColor : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      });
    }
  }, [
    activeTab,
    isAnnotatingZones,
    zoneEditor.mode,
    zoneEditor.geometry,
    zoneEditor.activeDrawingPoints,
    zoneEditor.selectedLaneIndex,
    zoneEditor.selectedExitIndex,
    zoneEditor.selectedVertex,
  ]);

  // Zero-React-rerender off-thread JPEG decoder + adaptive jitter-buffered <canvas> video player
  useEffect(() => {
    setHasLiveCanvasFrame(false);
    if (!auth.isAuthenticated || activeTab !== 'monitor' || isAnnotatingZones) {
      return;
    }

    let cancelled = false;
    const queue: ImageBitmap[] = [];
    const MAX_QUEUE = 4;
    let emaIntervalMs = 55;
    let lastArrivalAt = 0;
    let lastDrawAt = 0;
    let rafId = 0;
    let firstFrameShown = false;

    const clearQueue = () => {
      while (queue.length > 0) {
        queue.shift()?.close();
      }
    };

    const unsubRaw = vdatWsClient.onRawLiveFrame((pkt) => {
      if (cancelled || pkt.cameraId !== focusedCameraId || isStreamPausedRef.current) return;
      const now = performance.now();
      if (lastArrivalAt > 0) {
        const delta = now - lastArrivalAt;
        if (delta >= 15 && delta <= 250) {
          emaIntervalMs = emaIntervalMs * 0.8 + delta * 0.2;
        }
      }
      lastArrivalAt = now;

      void createImageBitmap(pkt.blob)
        .then((bitmap) => {
          if (cancelled) {
            bitmap.close();
            return;
          }
          if (queue.length >= MAX_QUEUE) {
            queue.shift()?.close();
          }
          queue.push(bitmap);
        })
        .catch(() => {
          // Ignore corrupt/cancelled decode
        });
    });

    const unsubStatus = vdatWsClient.onCameraSourceStatus((msg) => {
      if (msg.cameraId === focusedCameraId && (msg.status === 'stopped' || msg.status === 'ended')) {
        clearQueue();
        firstFrameShown = false;
        setHasLiveCanvasFrame(false);
      }
    });

    const drawLoop = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(drawLoop);

      if (queue.length === 0) return;

      const basePace = Math.min(85, Math.max(32, emaIntervalMs));
      const targetGap =
        queue.length >= 3 ? basePace * 0.55 : queue.length === 2 ? basePace * 0.8 : basePace * 0.92;

      if (lastDrawAt === 0 || now - lastDrawAt >= targetGap) {
        const canvas = liveStreamCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        const bitmap = queue.shift();
        if (bitmap) {
          if (canvas && ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            lastDrawAt = now;
            if (!firstFrameShown) {
              firstFrameShown = true;
              setHasLiveCanvasFrame(true);
            }
          }
          bitmap.close();
        }
      }
    };

    rafId = requestAnimationFrame(drawLoop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      unsubRaw();
      unsubStatus();
      clearQueue();
    };
  }, [auth.isAuthenticated, activeTab, isAnnotatingZones, focusedCameraId]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await auth.login({ email, password });
    } catch {
      // Error is stored in auth.error
    }
  };

  const openEvidenceViewer = (violation: Violation, preferredTab?: 'video' | 'snapshot') => {
    const hasClip = Boolean(violation.evidenceClipUrl);
    setVideoMediaExpired(false);
    setSnapshotMediaExpired(false);
    setActiveEvidence({
      violation,
      mediaTab: preferredTab ?? (hasClip ? 'video' : 'snapshot'),
    });
    evidenceDialogRef.current?.showModal();
  };

  const toggleAnnotationMode = (targetCameraId?: string, forceOpen?: boolean) => {
    const camId = targetCameraId || focusedCameraId;
    if (camId !== focusedCameraId) {
      initializedCameraConfigRef.current = null;
      initializedCameraSourceRef.current = null;
      stream.setSelectedCamera(camId);
    }
    const nextOpen = forceOpen !== undefined ? forceOpen : !isAnnotatingZones;
    setZoneSyncBanner(null);
    if (nextOpen) {
      const snap =
        transmitters.getChannelSnapshot(camId) ||
        (hasLiveCanvasFrame ? liveStreamCanvasRef.current?.toDataURL('image/jpeg', 0.88) ?? null : null) ||
        stream.cameraPreviews[camId] ||
        null;
      setEditorSnapshotUrl(snap);
    } else {
      setEditorSnapshotUrl(null);
      zoneEditor.cancelDrawing();
    }
    setIsAnnotatingZones(nextOpen);
    setActiveTab('monitor');
  };

  const handleSaveZones = async () => {
    const targetCameraId = focusedCameraId || currentCamera?.id || 'cam-01';
    setZoneSyncBanner(null);

    let nextLanes = zoneEditor.geometry.lanes;
    let nextIntersection = zoneEditor.geometry.intersection;
    let nextExitZones = zoneEditor.geometry.exitZones;
    if (zoneEditor.activeDrawingPoints.length >= 3) {
      const committedPolygon = [...zoneEditor.activeDrawingPoints];
      if (zoneEditor.mode === 'draw_lane') {
        nextLanes = [...nextLanes, committedPolygon];
      } else if (zoneEditor.mode === 'draw_intersection') {
        nextIntersection = committedPolygon;
      } else if (zoneEditor.mode === 'draw_exit_zone') {
        nextExitZones = [...nextExitZones, committedPolygon];
      }
      zoneEditor.finishDrawing();
    }

    const activeSourceKey = focusedChannel.isBroadcasting
      ? focusedChannel.sourceKey
      : currentCamera?.id === targetCameraId
        ? currentCamera?.activeSourceKey || currentCamera?.config?.sourceKey || `camera:${targetCameraId}`
        : `camera:${targetCameraId}`;

    try {
      const response = await updateZonesMutation.mutateAsync({
        cameraId: targetCameraId,
        payload: {
          sourceKey: activeSourceKey,
          lanes: nextLanes,
          intersection: nextIntersection,
          exitZones: nextExitZones,
          lightBox: zoneEditor.geometry.lightBoxes,
          crossingMode: zoneEditor.geometry.crossingMode,
          clearanceSeconds: zoneEditor.geometry.clearanceSeconds,
        },
      });
      setZoneSyncBanner(response.message);
      setIsAnnotatingZones(false);
      setEditorSnapshotUrl(null);
    } catch (err: any) {
      setZoneSyncBanner(err.message || 'Failed to save zone profile.');
    }
  };

  // Strict Authentication Gate: Unauthenticated visitors cannot view the dashboard
  if (!auth.isAuthenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-labelledby="sign-in-heading">
          <div>
            <div className="badge badge-standby" style={{ marginBlockEnd: '0.6rem' }}>
              VDAT Surveillance Control
            </div>
            <h1 id="sign-in-heading" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
              Sign In to VDAT Hub
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBlockStart: '0.25rem' }}>
              Authorized Police Officer or System Administrator credentials are required to access live camera feeds, violation evidence streams, and zone configuration.
            </p>
          </div>

          <form
            className="form-grid"
            method="post"
            action="/api/auth/login"
            onSubmit={handleLoginSubmit}
          >
            <div className="form-field">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                autoComplete="username"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                enterKeyHint="next"
                value={email}
                onChange={(e) => {
                  if (auth.error) auth.clearError();
                  setEmail(e.target.value);
                }}
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="current-password" className="form-label">
                Password
              </label>
              <div className="password-input-row">
                <input
                  id="current-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={password}
                  onChange={(e) => {
                    if (auth.error) auth.clearError();
                    setPassword(e.target.value);
                  }}
                  required
                />
                <button
                  type="button"
                  className="btn"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div aria-live="polite">
              {auth.error && (
                <div
                  style={{
                    color: 'var(--danger-text)',
                    background: 'var(--danger-soft)',
                    border: '1px solid var(--danger-border)',
                    padding: '0.55rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                  }}
                >
                  {auth.error}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-active"
              style={{ minBlockSize: '48px', fontSize: '0.92rem', fontWeight: 600 }}
              disabled={auth.isLoading}
            >
              {auth.isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="account-preset-box">
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>
              Registered Database Accounts (Quick Fill)
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  auth.clearError();
                  setEmail('admin@vdat.local');
                  setPassword('admin123');
                }}
              >
                Admin: admin@vdat.local (Full Access + Zone Editor)
              </button>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  auth.clearError();
                  setEmail('officer@vdat.local');
                  setPassword('police123');
                }}
              >
                Officer: officer@vdat.local (Monitor + Review)
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Merge live WebSocket alerts with stored database violations without duplicates
  const storedViolations = violationsQuery.data?.data ?? [];
  const mergedViolations: Violation[] = [];
  const seenIds = new Set<string>();

  for (const v of [...alerts.liveAlerts, ...storedViolations]) {
    if (!seenIds.has(v.id)) {
      const matchesStatus = !statusFilter || v.status === statusFilter;
      const matchesCamera = !cameraFilter || v.cameraId === cameraFilter;
      if (matchesStatus && matchesCamera) {
        seenIds.add(v.id);
        mergedViolations.push(v);
      }
    }
  }

  const cameraSlots =
    camerasQuery.data !== undefined
      ? camerasQuery.data
      : [
          { id: 'cam-01', name: 'Camera 01 (Primary)', location: 'Intersection 1', isActive: false, createdAt: '', updatedAt: '' },
          { id: 'cam-02', name: 'Camera 02', location: 'Intersection 2', isActive: false, createdAt: '', updatedAt: '' },
          { id: 'cam-03', name: 'Camera 03', location: 'Intersection 3', isActive: false, createdAt: '', updatedAt: '' },
        ];

  const handleCreateCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddCameraError(null);
    const id = newCamId.trim();
    const name = newCamName.trim() || `Camera ${id}`;
    const location = newCamLocation.trim() || 'Intersection';
    if (!id) {
      setAddCameraError('Camera ID is required (e.g. cam-04).');
      return;
    }
    try {
      await createCameraMutation.mutateAsync({ id, name, location });
      setNewCamId('');
      setNewCamName('');
      setNewCamLocation('');
    } catch (err: any) {
      setAddCameraError(err?.response?.data?.error || err.message || 'Failed to add camera.');
    }
  };

  const toggleCameraDeleteSelection = (camId: string) => {
    setDeleteCameraError(null);
    setSelectedDeleteIds((prev) =>
      prev.includes(camId) ? prev.filter((id) => id !== camId) : [...prev, camId]
    );
  };

  const handleDeleteSelectedCameras = async () => {
    if (selectedDeleteIds.length === 0) return;
    setDeleteCameraError(null);
    const idsToDelete = [...selectedDeleteIds];
    try {
      await deleteCamerasMutation.mutateAsync(idsToDelete);
      for (const camId of idsToDelete) {
        transmitters.stopBroadcast(camId);
      }
      if (idsToDelete.includes(focusedCameraId)) {
        const remaining = cameraSlots.filter((c) => !idsToDelete.includes(c.id));
        if (remaining.length > 0) {
          stream.setSelectedCamera(remaining[0].id);
        }
        setIsAnnotatingZones(false);
        setEditorSnapshotUrl(null);
      }
      setSelectedDeleteIds([]);
      closeManageCamerasDialog();
    } catch (err: any) {
      setDeleteCameraError(
        err?.response?.data?.error || err.message || 'Failed to delete selected camera(s).'
      );
    }
  };

  const lightCfg = getLightConfig(stream.telemetry.light_state);

  const activeViolation = activeEvidence
    ? mergedViolations.find((v) => v.id === activeEvidence.violation.id) ?? activeEvidence.violation
    : null;
  const activeSnapshotUrl = activeViolation
    ? evidenceApi.resolveMediaUrl(activeViolation.snapshotUrl)
    : '';
  const activeStreamUrl = activeViolation
    ? evidenceApi.resolveMediaUrl(
        activeViolation.evidenceClipUrl ||
          `/api/evidence/stream/${activeViolation.cameraId}/violation_${activeViolation.cameraId}_id${activeViolation.trackId}_f${activeViolation.frameNumber}.mp4`
      )
    : '';
  const activeDownloadUrl = activeStreamUrl
    ? `${activeStreamUrl}${activeStreamUrl.includes('?') ? '&' : '?'}download=1`
    : '';

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-bar">
            <button
              type="button"
              className="brand-home-btn"
              onClick={() => setActiveTab('monitor')}
              title="Return to Live Monitor"
            >
              VDAT Surveillance Hub
            </button>
          </div>

          <nav className="toolbar-actions" aria-label="Account and workspace menu">
            <button
              ref={userMenuTriggerRef}
              id="user-menu-trigger"
              type="button"
              className="user-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              {...({ commandfor: 'user-action-menu', command: 'toggle-popover' } as any)}
              onClick={() => handlePopoverTriggerClickFallback(userMenuPopoverRef.current)}
            >
              <span>
                {auth.user?.fullName} ({auth.role})
              </span>
              <span aria-hidden="true">▾</span>
            </button>
            {/* Directly after trigger so browsers emit no implicit aria-details */}
            <div
              ref={userMenuPopoverRef}
              id="user-action-menu"
              {...({ popover: 'auto' } as any)}
              className="cam-dropdown-popover popover-align-end"
            >
              <div
                ref={userMenuGroupRef}
                {...({ focusgroup: 'menu nomemory' } as any)}
                aria-labelledby="user-menu-trigger"
                className="cam-dropdown-menu"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={activeTab === 'analytics'}
                  onKeyDown={handleCheckboxMenuKeyDown}
                  onClick={() => {
                    setActiveTab((prev) => (prev === 'analytics' ? 'monitor' : 'analytics'));
                    closeAfterCheckboxAction(userMenuPopoverRef.current);
                  }}
                >
                  <span>Fleet &amp; Analytics</span>
                </button>

                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={audio.soundAlertsEnabled}
                  onKeyDown={handleCheckboxMenuKeyDown}
                  onClick={() => {
                    audio.setSoundAlertsEnabled(!audio.soundAlertsEnabled);
                    closeAfterCheckboxAction(userMenuPopoverRef.current);
                  }}
                >
                  <span>Audio Alerts</span>
                </button>

                <hr />

                <button
                  type="button"
                  className="menu-item-danger"
                  onClick={() => {
                    closeUserMenu(0);
                    auth.logout();
                  }}
                >
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </nav>
        </div>
      </header>

      {activeTab === 'monitor' && (
        <main className="workspace-grid">
          {/* Left Column: Primary Focused AI Stream (with In-Place Annotate Zones) + Multi-Source Wall */}
          <div className="primary-column">
            <section className="card card-stream" aria-labelledby="cam-menu-trigger">
              <div className="card-header">
                <div style={{ minInlineSize: 0 }}>
                  <button
                    ref={camMenuTriggerRef}
                    id="cam-menu-trigger"
                    type="button"
                    className="cam-title-trigger"
                    aria-haspopup="menu"
                    aria-expanded={isCamMenuOpen}
                    {...({ commandfor: 'cam-action-menu', command: 'toggle-popover' } as any)}
                    onClick={() => handlePopoverTriggerClickFallback(camMenuPopoverRef.current)}
                  >
                    <span className="cam-title-text">
                      Focused AI Stream ({focusedCameraId})
                      {focusedChannel.isBroadcasting ? ` — ${focusedChannel.sourceLabel}` : ''}
                    </span>
                    <span className="cam-title-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {/* Directly after trigger so browsers emit no implicit aria-details */}
                  <div
                    ref={camMenuPopoverRef}
                    id="cam-action-menu"
                    {...({ popover: 'auto' } as any)}
                    className="cam-dropdown-popover"
                  >
                    <div
                      ref={camMenuGroupRef}
                      {...({ focusgroup: 'menu nomemory' } as any)}
                      aria-labelledby="cam-menu-trigger"
                      className="cam-dropdown-menu"
                    >
                      <button type="button" onClick={openSourceDialog}>
                        <span>
                          {focusedChannel.isBroadcasting ? 'Change Source...' : 'Choose Source...'}
                        </span>
                      </button>

                      {auth.isAdmin && (
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={isAnnotatingZones}
                          onKeyDown={handleCheckboxMenuKeyDown}
                          onClick={() => {
                            toggleAnnotationMode(focusedCameraId, !isAnnotatingZones);
                            closeAfterCheckboxAction(camMenuPopoverRef.current);
                          }}
                        >
                          <span>Annotate Zones</span>
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={stream.isPaused}
                        disabled={!focusedChannel.isBroadcasting && !stream.isCameraLive}
                        onKeyDown={handleCheckboxMenuKeyDown}
                        onClick={() => {
                          stream.togglePause();
                          closeAfterCheckboxAction(camMenuPopoverRef.current);
                        }}
                      >
                        <span>Pause Feed</span>
                      </button>

                      {focusedChannel.sourceType === 'video_file' && (
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={focusedChannel.loopVideo}
                          onKeyDown={handleCheckboxMenuKeyDown}
                          onClick={() => {
                            transmitters.setLoopVideo(focusedCameraId, !focusedChannel.loopVideo);
                            closeAfterCheckboxAction(camMenuPopoverRef.current);
                          }}
                        >
                          <span>Loop Video</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="menu-item-danger"
                        disabled={!focusedChannel.isBroadcasting}
                        onClick={() => {
                          transmitters.stopBroadcast(focusedCameraId);
                          closeCamMenu(0);
                        }}
                      >
                        <span>Stop Feed</span>
                      </button>

                      <hr />

                      <div role="group" aria-label="Detection Engine">
                        <div className="cam-menu-group-label" aria-hidden="true">
                          Detect Engine
                        </div>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={stream.modelStatus.profile === 'trained'}
                          disabled={
                            !stream.isConnected ||
                            stream.activeCameras.length === 0 ||
                            Boolean(stream.modelStatus.switching)
                          }
                          onClick={() => {
                            stream.switchAiModel('trained');
                            closeCamMenu(250);
                          }}
                        >
                          <span>VDAT Trained (best.pt)</span>
                          {stream.modelStatus.switching &&
                            stream.modelStatus.profile !== 'trained' && (
                              <span className="hint" aria-hidden="true">
                                Switching...
                              </span>
                            )}
                        </button>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={stream.modelStatus.profile === 'stock'}
                          disabled={
                            !stream.isConnected ||
                            stream.activeCameras.length === 0 ||
                            Boolean(stream.modelStatus.switching)
                          }
                          onClick={() => {
                            stream.switchAiModel('stock');
                            closeCamMenu(250);
                          }}
                        >
                          <span>Stock YOLO26l (Legacy)</span>
                          {stream.modelStatus.switching &&
                            stream.modelStatus.profile !== 'stock' && (
                              <span className="hint" aria-hidden="true">
                                Switching...
                              </span>
                            )}
                        </button>
                      </div>

                      <hr />

                      <div role="group" aria-label="Tracking Engine">
                        <div className="cam-menu-group-label" aria-hidden="true">
                          Tracking Engine
                        </div>
                        {(
                          [
                            ['bytetrack', 'ByteTrack'],
                            ['botsort', 'BoT-SORT'],
                            ['deepsort', 'DeepSORT'],
                          ] as const
                        ).map(([trackerId, trackerLabel]) => (
                          <button
                            key={trackerId}
                            type="button"
                            role="menuitemradio"
                            aria-checked={stream.trackerStatus.tracker === trackerId}
                            disabled={
                              !stream.isConnected ||
                              stream.activeCameras.length === 0 ||
                              Boolean(stream.trackerStatus.switching)
                            }
                            onClick={() => {
                              stream.switchAiTracker(trackerId);
                              closeCamMenu(250);
                            }}
                          >
                            <span>{trackerLabel}</span>
                            {stream.trackerStatus.switching &&
                              stream.trackerStatus.tracker !== trackerId && (
                                <span className="hint" aria-hidden="true">
                                  Switching...
                                </span>
                              )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="toolbar-actions" />
              </div>

              <input
                ref={focusedFileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setEditorSnapshotUrl(null);
                    void transmitters.startVideoFileStream(focusedCameraId, file);
                    closeSourceDialog();
                    e.target.value = '';
                  }
                }}
              />

              {focusedChannel.error && (
                <div
                  style={{
                    padding: '0.45rem 1rem',
                    background: 'var(--danger-soft)',
                    borderBlockEnd: '1px solid var(--danger-border)',
                    color: 'var(--danger-text)',
                    fontSize: '0.78rem',
                  }}
                >
                  {focusedChannel.error}
                </div>
              )}

              {zoneSyncBanner && (
                <div
                  style={{
                    padding: '0.45rem 1rem',
                    background: 'var(--primary-soft)',
                    borderBlockEnd: '1px solid var(--primary-border)',
                    color: 'var(--primary-text)',
                    fontSize: '0.78rem',
                  }}
                >
                  {zoneSyncBanner}
                </div>
              )}

              <div className="video-viewport">
                {isAnnotatingZones && auth.isAdmin ? (
                  (() => {
                    const annotationBg =
                      editorSnapshotUrl ||
                      transmitters.getChannelSnapshot(focusedCameraId) ||
                      stream.latestFrameImage ||
                      null;

                    if (!annotationBg) {
                      return (
                        <div className="stream-placeholder">
                          <span>No raw video frame captured yet for {focusedCameraId}</span>
                          <span style={{ fontSize: '0.78rem', maxInlineSize: '56ch' }}>
                            Open the camera title menu above and choose <strong>Choose Source...</strong> to start a feed and annotate directly over the clean frame.
                          </span>
                          <button
                            type="button"
                            className="btn btn-compact btn-active"
                            onClick={openSourceDialog}
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
                          src={annotationBg}
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
                  })()
                ) : (
                  <>
                    <canvas
                      ref={liveStreamCanvasRef}
                      width={DEFAULT_CAMERA_WIDTH}
                      height={DEFAULT_CAMERA_HEIGHT}
                      className="stream-canvas"
                      style={{ display: hasLiveCanvasFrame && stream.isCameraLive ? 'block' : 'none' }}
                      aria-label={`Live AI feed from ${focusedCameraId}`}
                    />
                    {(!hasLiveCanvasFrame || !stream.isCameraLive) && (
                      <div className="stream-placeholder">
                        <div className="spinner" aria-hidden="true" />
                        {focusedChannel.uploadProgress !== null ? (
                          <>
                            <span style={{ color: 'var(--primary-text)', fontWeight: 600 }}>
                              {focusedChannel.uploadProgress < 100
                                ? `Uploading "${focusedChannel.sourceLabel}" to AI engine (${focusedChannel.uploadProgress}%)...`
                                : `Syncing "${focusedChannel.sourceLabel}" to AI engine...`}
                            </span>
                            <span style={{ fontSize: '0.78rem', maxInlineSize: '60ch' }}>
                              Video plays locally on the AI host once synced so zero uplink bandwidth is used during analysis.
                            </span>
                          </>
                        ) : focusedChannel.isBroadcasting && !stream.isCameraLive ? (
                          <>
                            <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                              {focusedChannel.isAiHostedVideo
                                ? `Hosting "${focusedChannel.sourceLabel}" on ${focusedCameraId}, waiting for AI stream...`
                                : `Feeding "${focusedChannel.sourceLabel}" (${focusedChannel.transmittedFrames} frames sent), but AI session for ${focusedCameraId} is not connected`}
                            </span>
                            <span style={{ fontSize: '0.78rem', maxInlineSize: '64ch' }}>
                              Start the multi-camera AI engine with{' '}
                              <code>
                                python main.py --web-input --cameras {cameraSlots.map((c) => c.id).join(' ')} --ws-url ws://localhost:5000/ws/inference --no-video
                              </code>
                            </span>
                          </>
                        ) : (
                          <>
                            <span>Waiting for AI-annotated camera stream ({focusedCameraId})</span>
                            <span style={{ fontSize: '0.78rem' }}>
                              Open the camera title menu above to choose a video file or laptop camera while the AI engine is connected
                            </span>
                            <button
                              type="button"
                              className="btn btn-compact btn-active"
                              onClick={openSourceDialog}
                            >
                              Choose Source...
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="hud-wrapper">
                <div className="hud-bar">
                  <div className="stat-box">
                    <div className="stat-label">Active Vehicles</div>
                    <div className="stat-value">{stream.telemetry.vehicle_count ?? 0}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Total Tracked</div>
                    <div className="stat-value">{stream.telemetry.total_tracked ?? 0}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Violation Count</div>
                    <div className="stat-value" style={{ color: 'var(--danger)' }}>
                      {stream.telemetry.violations_count ?? mergedViolations.length}
                    </div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Stream FPS</div>
                    <div className="stat-value">{stream.telemetry.fps ?? 0} FPS</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">Signal</div>
                    <div className="stat-value" style={{ color: lightCfg.color }}>
                      {lightCfg.label}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Multi-Source Camera Preview Wall (Raw Previews + Background AI Processing) */}
            <section className="card" aria-labelledby="camera-wall-title">
              <div className="card-header">
                <span id="camera-wall-title">
                  Multi-Camera Source Wall ({cameraSlots.length} Slots •{' '}
                  {stream.activeCameras.length} AI Online)
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
                  const camTelemetry = stream.telemetryByCamera[cam.id];
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
                          onClick={() => {
                            setIsAnnotatingZones(false);
                            setEditorSnapshotUrl(null);
                            stream.setSelectedCamera(cam.id);
                          }}
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
            </section>
          </div>

          {/* Right Column: Transforms into Dedicated Zone Annotation Panel when annotating, otherwise Violation Evidence */}
          {isAnnotatingZones && auth.isAdmin ? (
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
                  disabled={updateZonesMutation.isPending}
                  onClick={handleSaveZones}
                >
                  {updateZonesMutation.isPending ? 'Saving...' : 'Save & Sync'}
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
                      onClick={() => {
                        const snap = transmitters.getChannelSnapshot(focusedCameraId);
                        if (snap) setEditorSnapshotUrl(snap);
                      }}
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
                    Click near the first vertex to auto-complete polygon, or press <strong>Esc</strong> / <strong>Cancel Draw</strong>.
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

                {/* 4. Multi-Lane Crossing Toggle */}
                <div className="annotate-section">
                  <label className="crossing-toggle-label" style={{ padding: '0.5rem 0.65rem' }}>
                    <input
                      type="checkbox"
                      checked={zoneEditor.geometry.crossingMode}
                      onChange={(e) => zoneEditor.setCrossingMode(e.target.checked)}
                    />
                    <span>3/4-Way Multi-Lane Mode (3s Clearance + Exit Zone)</span>
                  </label>
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
                          <strong>Intersection</strong> ({zoneEditor.geometry.intersection.length}{' '}
                          pts)
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
                          <strong style={{ textTransform: 'uppercase' }}>
                            {lb.color ?? 'red'} Light
                          </strong>{' '}
                          ({lb.x}, {lb.y})
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
          ) : (
            <aside className="card card-sidebar" aria-labelledby="proofs-title">
            <div className="card-header">
              <span id="proofs-title">Violation Evidence ({mergedViolations.length})</span>
              <div className="toolbar-actions">
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => exportViolationsToCsv(mergedViolations)}
                  disabled={mergedViolations.length === 0}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div
              className="filter-bar"
              role="group"
              aria-label="Filter violations by status and camera"
              style={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div className="toolbar-actions">
                <label
                  htmlFor="violation-status-filter"
                  style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
                >
                  Status:
                </label>
                <select
                  id="violation-status-filter"
                  className="btn btn-compact"
                  value={statusFilter ?? 'ALL'}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value === 'ALL' ? undefined : (e.target.value as ViolationStatus)
                    )
                  }
                >
                  <option value="ALL">All</option>
                  <option value="PENDING_REVIEW">
                    {VIOLATION_STATUS_CONFIG.PENDING_REVIEW.label}
                  </option>
                  <option value="CONFIRMED">{VIOLATION_STATUS_CONFIG.CONFIRMED.label}</option>
                  <option value="DISMISSED">{VIOLATION_STATUS_CONFIG.DISMISSED.label}</option>
                </select>
              </div>

              <div className="toolbar-actions">
                <label
                  htmlFor="violation-camera-filter"
                  style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
                >
                  Camera:
                </label>
                <select
                  id="violation-camera-filter"
                  className="btn btn-compact"
                  value={cameraFilter ?? 'ALL'}
                  onChange={(e) =>
                    setCameraFilter(e.target.value === 'ALL' ? undefined : e.target.value)
                  }
                >
                  <option value="ALL">All Cameras</option>
                  {cameraSlots.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="evidence-feed">
              {mergedViolations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No violations matching current filter.
                </div>
              ) : (
                mergedViolations.map((v) => {
                  const snapshotUrl = evidenceApi.resolveMediaUrl(v.snapshotUrl);
                  const statusCfg = VIOLATION_STATUS_CONFIG[v.status];

                  return (
                    <article key={v.id} className="violation-card">
                      <img
                        className="violation-thumb"
                        src={snapshotUrl || EXPIRED_THUMB_SVG}
                        alt={`Violation #${v.trackId}`}
                        title="Click to inspect violation evidence"
                        onError={(e) => {
                          if (e.currentTarget.dataset.expired === '1') return;
                          e.currentTarget.dataset.expired = '1';
                          e.currentTarget.src = EXPIRED_THUMB_SVG;
                        }}
                        onClick={() => openEvidenceViewer(v, 'video')}
                      />
                      <div className="violation-info">
                        {/* Row 1: Vehicle + ID */}
                        <div className="violation-title">
                          <span style={{ textTransform: 'capitalize' }}>{v.vehicleClass}</span>
                          <span>#{v.trackId}</span>
                        </div>

                        {/* Row 2: Camera + Reviewing State */}
                        <div className="violation-badges-row">
                          <span className="violation-attr-cam">{v.cameraId}</span>
                          <span className="violation-attr-sep" aria-hidden="true">
                            •
                          </span>
                          <span
                            className="violation-attr-status"
                            style={{ color: statusCfg.color }}
                          >
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Row 3: Info (Confidence + relative time) */}
                        <div className="violation-meta">
                          Confidence: {formatConfidence(v.confidence)} •{' '}
                          {formatShortRelativeTime(v.createdAt, relativeNowMs)}
                        </div>

                        {/* Row 4: Confirm and Dismiss */}
                        {v.status === 'PENDING_REVIEW' && (
                          <div className="violation-actions">
                            <button
                              type="button"
                              className="btn btn-compact btn-danger"
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: v.id,
                                  payload: { status: 'CONFIRMED' },
                                })
                              }
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="btn btn-compact"
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: v.id,
                                  payload: { status: 'DISMISSED' },
                                })
                              }
                            >
                              Dismiss
                            </button>
                          </div>
                        )}

                        {/* Row 5: Stream Video and Snapshot */}
                        <div className="violation-actions">
                          <button
                            type="button"
                            className="btn btn-compact btn-purple"
                            onClick={() => openEvidenceViewer(v, 'video')}
                          >
                            Stream Video
                          </button>
                          <button
                            type="button"
                            className="btn btn-compact"
                            onClick={() => openEvidenceViewer(v, 'snapshot')}
                          >
                            Snapshot
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </aside>
          )}
        </main>
      )}

      {activeTab === 'analytics' && (
        <main className="workspace-single">
          <section className="kpi-grid" aria-label="Key metrics">
            <div className="stat-box">
              <div className="stat-label">Total Violations</div>
              <div className="stat-value">
                {statsQuery.data?.summary.totalViolations ?? mergedViolations.length}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Pending Review</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>
                {statsQuery.data?.summary.pendingReview ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Confirmed Violations</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {statsQuery.data?.summary.confirmed ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Dismissed</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>
                {statsQuery.data?.summary.dismissed ?? 0}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Active AI Cameras</div>
              <div className="stat-value">
                {statsQuery.data?.summary.activeCamerasCount ?? stream.activeCameras.length}
              </div>
            </div>
          </section>

          <div className="analytics-columns">
            <section className="card">
              <div className="card-header">
                <span>Registered Camera Fleet</span>
              </div>
              <div className="data-list">
                {(camerasQuery.data ?? []).length === 0 ? (
                  <div className="data-row">
                    <span>cam-01 — Intersection Surveillance</span>
                    <span className="badge badge-standby">Registered</span>
                  </div>
                ) : (
                  camerasQuery.data?.map((cam) => (
                    <div key={cam.id} className="data-row">
                      <div>
                        <strong>{cam.name}</strong> ({cam.id})
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {cam.location} • Last seen: {formatDateTime(cam.lastSeenAt)}
                        </div>
                      </div>
                      <div className="toolbar-actions">
                        {auth.isAdmin && (
                          <button
                            type="button"
                            className="btn btn-compact"
                            onClick={() => toggleAnnotationMode(cam.id, true)}
                          >
                            Annotate Zones
                          </button>
                        )}
                        <span className={`badge ${cam.isLive ? 'badge-live' : 'badge-standby'}`}>
                          {cam.isLive ? 'LIVE' : 'STANDBY'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span>Violations by Vehicle Class</span>
              </div>
              <div className="data-list">
                {(statsQuery.data?.byVehicleClass ?? []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No vehicle class violation records found.
                  </div>
                ) : (
                  statsQuery.data?.byVehicleClass.map((item) => (
                    <div key={item.class} className="data-row">
                      <span style={{ textTransform: 'capitalize' }}>{item.class}</span>
                      <strong>
                        {item.count} {item.count === 1 ? 'violation' : 'violations'}
                      </strong>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </main>
      )}

      {/* Seamless Video & Snapshot Evidence Player Modal */}
      <dialog
        ref={evidenceDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog"
        aria-labelledby="evidence-dialog-title"
        onClose={() => setActiveEvidence(null)}
      >
        <div className="dialog-header">
          <h1 id="evidence-dialog-title" className="dialog-title">
            {activeViolation
              ? `Violation Evidence — Track #${activeViolation.trackId} (${activeViolation.vehicleClass}) • Frame ${activeViolation.frameNumber}`
              : 'Violation Evidence'}
          </h1>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              Close
            </button>
          </form>
        </div>

        {activeViolation && activeEvidence && (
          <div className="dialog-body">
            <div
              className="toolbar-actions"
              style={{ justifyContent: 'space-between', width: '100%' }}
            >
              <div className="toolbar-actions">
                <button
                  type="button"
                  className={`btn btn-compact ${
                    activeEvidence.mediaTab === 'video' ? 'btn-active' : ''
                  }`}
                  onClick={() =>
                    setActiveEvidence({ violation: activeViolation, mediaTab: 'video' })
                  }
                >
                  Video Evidence Stream
                </button>
                <button
                  type="button"
                  className={`btn btn-compact ${
                    activeEvidence.mediaTab === 'snapshot' ? 'btn-active' : ''
                  }`}
                  onClick={() =>
                    setActiveEvidence({ violation: activeViolation, mediaTab: 'snapshot' })
                  }
                >
                  Annotated Snapshot
                </button>
              </div>

              <div className="toolbar-actions">
                {activeViolation.status === 'PENDING_REVIEW' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-compact btn-danger"
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeViolation.id,
                          payload: { status: 'CONFIRMED' },
                        })
                      }
                    >
                      Confirm Violation
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact"
                      onClick={() =>
                        reviewMutation.mutate({
                          id: activeViolation.id,
                          payload: { status: 'DISMISSED' },
                        })
                      }
                    >
                      Dismiss
                    </button>
                  </>
                )}
                {activeDownloadUrl && !videoMediaExpired && (
                  <a href={activeDownloadUrl} download className="btn btn-compact">
                    Download MP4
                  </a>
                )}
                {activeSnapshotUrl && !snapshotMediaExpired && (
                  <a href={activeSnapshotUrl} download className="btn btn-compact">
                    Download JPG
                  </a>
                )}
              </div>
            </div>

            <div className="evidence-player-frame">
              {activeEvidence.mediaTab === 'video' ? (
                !activeStreamUrl || videoMediaExpired ? (
                  <div className="evidence-expired-state">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <strong>Evidence Clip Expired</strong>
                    <span>
                      This temporary violation video clip has expired or is no longer available on the server.
                    </span>
                  </div>
                ) : (
                  <video
                    key={activeStreamUrl}
                    src={activeStreamUrl}
                    poster={!snapshotMediaExpired && activeSnapshotUrl ? activeSnapshotUrl : undefined}
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    onError={() => setVideoMediaExpired(true)}
                  />
                )
              ) : !activeSnapshotUrl || snapshotMediaExpired ? (
                <div className="evidence-expired-state">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <strong>Evidence Snapshot Expired</strong>
                  <span>
                    This temporary snapshot image has expired or was purged from storage.
                  </span>
                </div>
              ) : (
                <img
                  src={activeSnapshotUrl}
                  alt={`Snapshot for Violation #${activeViolation.trackId}`}
                  onError={() => setSnapshotMediaExpired(true)}
                />
              )}
            </div>
          </div>
        )}
      </dialog>

      {/* Choose / Change Camera Source Modal Dialog (Native light-dismiss via closedby="any") */}
      <dialog
        ref={sourceDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog source-dialog"
        aria-labelledby="source-dialog-title"
      >
        <div className="dialog-header">
          <h1 id="source-dialog-title" className="dialog-title">
            {focusedChannel.isBroadcasting ? 'Change Source' : 'Choose Source'} ({focusedCameraId})
          </h1>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              Close
            </button>
          </form>
        </div>

        <div className="dialog-body">
          <div className="source-dialog-status">
            <span>
              {focusedChannel.isBroadcasting ? (
                <>
                  Active: <strong>{focusedChannel.sourceLabel}</strong> (
                  {focusedChannel.uploadProgress !== null
                    ? `Uploading ${focusedChannel.uploadProgress}%`
                    : focusedChannel.isAiHostedVideo
                      ? 'AI Hosted'
                      : `${focusedChannel.transmittedFrames} frames`}
                  )
                </>
              ) : (
                <>No active source connected on {focusedCameraId}.</>
              )}
            </span>
          </div>

          <div className="source-dialog-options">
            <button
              type="button"
              className="btn btn-active"
              onClick={() => focusedFileInputRef.current?.click()}
            >
              {focusedChannel.sourceType === 'video_file'
                ? 'Choose Different Video File (.mp4)...'
                : 'Upload Video File (.mp4)...'}
            </button>

            <button
              type="button"
              className={`btn ${focusedChannel.sourceType === 'laptop_webcam' ? 'btn-active' : ''}`}
              onClick={() => {
                setEditorSnapshotUrl(null);
                void transmitters.startLaptopCameraStream(focusedCameraId);
                closeSourceDialog();
              }}
            >
              Use Laptop Camera (Webcam)
            </button>

            {transmitters.webcamDevices.length > 0 && (
              <div className="form-field">
                <label htmlFor="source-webcam-select" className="form-label">
                  Webcam Device
                </label>
                <select
                  id="source-webcam-select"
                  className="btn"
                  value={focusedChannel.selectedDeviceId}
                  onChange={(e) => {
                    transmitters.setSelectedDeviceId(focusedCameraId, e.target.value);
                    setEditorSnapshotUrl(null);
                    void transmitters.startLaptopCameraStream(focusedCameraId, e.target.value);
                    closeSourceDialog();
                  }}
                >
                  {transmitters.webcamDevices.map((dev) => (
                    <option key={dev.deviceId} value={dev.deviceId}>
                      {dev.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </dialog>
      {/* Add / Delete Camera Modal Dialog (Admin Only, Native light-dismiss via closedby="any") */}
      <dialog
        ref={manageCamerasDialogRef}
        {...({ closedby: 'any' } as any)}
        className="app-dialog manage-cameras-dialog"
        aria-labelledby="manage-cameras-dialog-title"
        onClose={() => {
          setSelectedDeleteIds([]);
          setAddCameraError(null);
          setDeleteCameraError(null);
        }}
      >
        <div className="dialog-header">
          <h1 id="manage-cameras-dialog-title" className="dialog-title">
            Add / Delete Camera
          </h1>
          <form method="dialog">
            <button type="submit" className="btn btn-compact">
              Close
            </button>
          </form>
        </div>

        <div className="dialog-body">
          {/* Section 1: Add Camera */}
          <section className="manage-cameras-section" aria-labelledby="add-camera-section-title">
            <div id="add-camera-section-title" className="zone-section-title" style={{ marginBlockEnd: 0 }}>
              Add Camera Slot
            </div>
            <form className="manage-cameras-add-grid" onSubmit={handleCreateCamera}>
              <div className="form-field">
                <label htmlFor="new-cam-id" className="form-label" style={{ fontSize: '0.74rem' }}>
                  Camera ID
                </label>
                <input
                  id="new-cam-id"
                  type="text"
                  className="add-camera-input"
                  placeholder={`cam-${String(cameraSlots.length + 1).padStart(2, '0')}`}
                  value={newCamId}
                  onChange={(e) => setNewCamId(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="new-cam-name" className="form-label" style={{ fontSize: '0.74rem' }}>
                  Name
                </label>
                <input
                  id="new-cam-name"
                  type="text"
                  className="add-camera-input"
                  placeholder={`Camera ${String(cameraSlots.length + 1).padStart(2, '0')}`}
                  value={newCamName}
                  onChange={(e) => setNewCamName(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="new-cam-loc" className="form-label" style={{ fontSize: '0.74rem' }}>
                  Location
                </label>
                <input
                  id="new-cam-loc"
                  type="text"
                  className="add-camera-input"
                  placeholder="Intersection"
                  value={newCamLocation}
                  onChange={(e) => setNewCamLocation(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-compact btn-success"
                style={{ alignSelf: 'end', minBlockSize: '33px' }}
                disabled={createCameraMutation.isPending}
              >
                {createCameraMutation.isPending ? 'Adding...' : '+ Add'}
              </button>
            </form>
            {addCameraError && (
              <div style={{ color: 'var(--danger-text)', fontSize: '0.76rem' }}>
                {addCameraError}
              </div>
            )}
          </section>

          <hr className="dialog-divider" />

          {/* Section 2: Multi-Select Delete Cameras */}
          <section className="manage-cameras-section" aria-labelledby="delete-cameras-section-title">
            <div className="manage-cameras-section-head">
              <div id="delete-cameras-section-title" className="zone-section-title" style={{ marginBlockEnd: 0 }}>
                Select Camera(s) to Delete ({selectedDeleteIds.length} selected)
              </div>
              {cameraSlots.length > 0 && (
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => {
                    if (selectedDeleteIds.length === cameraSlots.length) {
                      setSelectedDeleteIds([]);
                    } else {
                      setSelectedDeleteIds(cameraSlots.map((c) => c.id));
                    }
                  }}
                >
                  {selectedDeleteIds.length === cameraSlots.length ? 'Clear All' : 'Select All'}
                </button>
              )}
            </div>

            {cameraSlots.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                No registered cameras to delete.
              </div>
            ) : (
              <div className="camera-delete-list" role="group" aria-label="Registered cameras">
                {cameraSlots.map((cam) => {
                  const isChecked = selectedDeleteIds.includes(cam.id);
                  const isAiOnline = stream.activeCameras.includes(cam.id);
                  const violationsCount = cam.violationCount ?? 0;

                  return (
                    <label
                      key={cam.id}
                      className={`camera-delete-row ${isChecked ? 'is-selected' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCameraDeleteSelection(cam.id)}
                      />
                      <div className="camera-delete-info">
                        <div className="camera-delete-title">
                          <strong>{cam.id}</strong> — {cam.name}
                        </div>
                        <div className="camera-delete-meta">
                          <span>{cam.location}</span>
                          <span>•</span>
                          <span
                            style={{
                              color: isAiOnline ? 'var(--success-text)' : 'var(--text-muted)',
                            }}
                          >
                            {isAiOnline ? 'AI Online' : 'AI Offline'}
                          </span>
                          <span>•</span>
                          <span>
                            {violationsCount} {violationsCount === 1 ? 'violation' : 'violations'}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {deleteCameraError && (
              <div style={{ color: 'var(--danger-text)', fontSize: '0.76rem' }}>
                {deleteCameraError}
              </div>
            )}

            <div className="manage-cameras-footer">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Deleting camera(s) also removes their associated violation history.
              </span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={selectedDeleteIds.length === 0 || deleteCamerasMutation.isPending}
                onClick={handleDeleteSelectedCameras}
              >
                {deleteCamerasMutation.isPending
                  ? 'Deleting...'
                  : `Delete Selected (${selectedDeleteIds.length})`}
              </button>
            </div>
          </section>
        </div>
      </dialog>
    </>
  );
}
