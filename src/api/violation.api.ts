import { apiClient } from './client';
import {
  Violation,
  ViolationQueryParams,
  PaginatedViolations,
  UpdateViolationStatusPayload,
} from '../types/violation.types';

export const violationApi = {
  /**
   * Fetch paginated violations log with optional filters (cameraId, status, vehicleClass, date range)
   */
  async listViolations(params?: ViolationQueryParams): Promise<PaginatedViolations> {
    const { data } = await apiClient.get<PaginatedViolations>('/api/violations', {
      params,
    });
    return data;
  },

  /**
   * Review violation: update status to CONFIRMED or DISMISSED with officer notes
   */
  async updateViolationStatus(
    id: string,
    payload: UpdateViolationStatusPayload
  ): Promise<Violation> {
    const { data } = await apiClient.patch<Violation>(
      `/api/violations/${encodeURIComponent(id)}/status`,
      payload
    );
    return data;
  },
};

