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
   * Get single camera details and zone configuration
   */
  async getCamera(id: string): Promise<Camera> {
    const { data } = await apiClient.get<Camera>(`/api/cameras/${encodeURIComponent(id)}`);
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
};

