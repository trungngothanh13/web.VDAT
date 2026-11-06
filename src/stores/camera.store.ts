import { create } from 'zustand';
import { Camera, CameraConfig } from '../types/camera.types';

interface CameraStoreState {
  cameras: Camera[];
  selectedCamera: Camera | null;
  activeConfig: CameraConfig | null;
  isEditingZones: boolean;
  hasUnsavedZoneChanges: boolean;

  // Actions
  setCameras: (cameras: Camera[]) => void;
  setSelectedCamera: (camera: Camera | null) => void;
  setActiveConfig: (config: CameraConfig | null) => void;
  setIsEditingZones: (editing: boolean) => void;
  setHasUnsavedZoneChanges: (unsaved: boolean) => void;
  updateCameraInList: (updated: Camera) => void;
}

export const useCameraStore = create<CameraStoreState>((set) => ({
  cameras: [],
  selectedCamera: null,
  activeConfig: null,
  isEditingZones: false,
  hasUnsavedZoneChanges: false,

  setCameras: (cameras: Camera[]) => set({ cameras }),
  setSelectedCamera: (camera: Camera | null) =>
    set({
      selectedCamera: camera,
      activeConfig: camera?.config || null,
      hasUnsavedZoneChanges: false,
    }),
  setActiveConfig: (config: CameraConfig | null) => set({ activeConfig: config }),
  setIsEditingZones: (editing: boolean) => set({ isEditingZones: editing }),
  setHasUnsavedZoneChanges: (unsaved: boolean) => set({ hasUnsavedZoneChanges: unsaved }),

  updateCameraInList: (updated: Camera) =>
    set((state) => ({
      cameras: state.cameras.map((c) => (c.id === updated.id ? updated : c)),
      selectedCamera: state.selectedCamera?.id === updated.id ? updated : state.selectedCamera,
    })),
}));
