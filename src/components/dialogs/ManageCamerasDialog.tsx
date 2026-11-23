import React, { useState, type RefObject } from 'react';
import { useCreateCamera, useDeleteCameras } from '../../hooks/useCameras';
import { useDialogLightDismiss } from '../../hooks/useDialogLightDismiss';
import type { Camera } from '../../types/camera.types';

interface ManageCamerasDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  cameraSlots: Camera[];
  activeCameras: string[];
  onCamerasDeleted: (deletedIds: string[]) => void;
}

export function ManageCamerasDialog({
  dialogRef,
  cameraSlots,
  activeCameras,
  onCamerasDeleted,
}: ManageCamerasDialogProps) {
  useDialogLightDismiss(dialogRef);

  const createCameraMutation = useCreateCamera();
  const deleteCamerasMutation = useDeleteCameras();

  const [newCamId, setNewCamId] = useState('');
  const [newCamName, setNewCamName] = useState('');
  const [newCamLocation, setNewCamLocation] = useState('');
  const [addCameraError, setAddCameraError] = useState<string | null>(null);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [deleteCameraError, setDeleteCameraError] = useState<string | null>(null);

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
      onCamerasDeleted(idsToDelete);
      setSelectedDeleteIds([]);
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    } catch (err: any) {
      setDeleteCameraError(
        err?.response?.data?.error || err.message || 'Failed to delete selected camera(s).'
      );
    }
  };

  return (
    <dialog
      ref={dialogRef}
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
                const isAiOnline = activeCameras.includes(cam.id);
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
  );
}
