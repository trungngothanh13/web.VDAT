import { apiClient } from './client';
import { Camera, UpdateZonePayload, UpdateZoneResponse } from '../types/camera.types';

export const cameraApi = {
  /**
   * List all registered cameras with live status and violation count
   */
  async listCameras(): Promise<Camera[]> {
    const { data } = await apiClient.get<Camera[]>('/api/cameras');
    return data;
  },

  /**
   * Get single camera details and zone configuration
   */
  async getCamera(id: string): Promise<Camera> {
    const { data } = await apiClient.get<Camera>(`/api/cameras/${encodeURIComponent(id)}`);
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
};
