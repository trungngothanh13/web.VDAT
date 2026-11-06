import { apiClient } from './client';
import { OverviewStats } from '../types/stats.types';

export const statsApi = {
  /**
   * Fetch overview stats: total violations, pending review, confirmed, dismissed,
   * counts by vehicle class, counts by camera, and recent violations.
   */
  async getOverviewStats(): Promise<OverviewStats> {
    const { data } = await apiClient.get<OverviewStats>('/api/stats/overview');
    return data;
  },
};

