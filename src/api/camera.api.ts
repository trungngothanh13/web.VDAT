import { apiClient } from './client';
import {
  Camera,
  ZoneProfileConfig,
  UpdateZonePayload,
  UpdateZoneResponse,
} from '../types/camera.types';

export const cameraApi = {
  /**
   * List all registered cameras with live status and violation count
   */
  async listCameras(): Promise<Camera[]> {
    const { data } = await apiClient.get<Camera[]>('/api/cameras');
    return data;
  },

  /**
   * List saved source-keyed zone profiles
   */
  async listZoneProfiles(): Promise<ZoneProfileConfig[]> {
    const { data } = await apiClient.get<ZoneProfileConfig[]>('/api/cameras/profiles');
    return data;
  },

  /**
   * Register a new camera slot (Admin only)
   */
  async createCamera(payload: { id: string; name: string; location?: string }): Promise<Camera> {
    const { data } = await apiClient.post<Camera>('/api/cameras', payload);
    return data;
  },

  /**
   * Delete one or more camera slots (Admin only)
   */
  async deleteCameras(ids: string[]): Promise<{ deleted: string[]; count: number }> {
    const { data } = await apiClient.post<{ deleted: string[]; count: number }>(
      '/api/cameras/delete',
      { ids }
    );
    return data;
  },

  /**
   * Update lane and intersection polygon zones (Admin only)
   * Automatically pushes update to AI engine on ThunderCompute
   */
  async updateZoneConfig(id: string, payload: UpdateZonePayload): Promise<UpdateZoneResponse> {
    const { data } = await apiClient.put<UpdateZoneResponse>(
      `/api/cameras/${encodeURIComponent(id)}/zones`,
      payload
    );
    return data;
  },

  /**
   * Upload a video file once to api.VDAT so ai.VDAT can pull & play it locally (0 Mbps uplink during playback)
   */
  async uploadCameraVideo(
    id: string,
    file: File,
    loop: boolean,
    onUploadProgress?: (percent: number) => void
  ): Promise<{ cameraId: string; filename: string; originalName: string; sourceKey: string; loop: boolean }> {
    const formData = new FormData();
    formData.append('loop', String(loop));
    formData.append('file', file);

    const { data } = await apiClient.post(
      `/api/cameras/${encodeURIComponent(id)}/video`,
      formData,
      {
        timeout: 300000,
        headers: { 'Content-Type': undefined },
        onUploadProgress: (evt) => {
          if (onUploadProgress && evt.total && evt.total > 0) {
            onUploadProgress(Math.min(100, Math.round((evt.loaded * 100) / evt.total)));
          }
        },
      }
    );
    return data;
  },

  /**
   * Stop and delete temporary AI-hosted video footage for a camera
   */
  async stopCameraVideo(id: string): Promise<{ stopped: boolean; cameraId: string }> {
    const { data } = await apiClient.delete<{ stopped: boolean; cameraId: string }>(
      `/api/cameras/${encodeURIComponent(id)}/video`
    );
    return data;
  },
};

