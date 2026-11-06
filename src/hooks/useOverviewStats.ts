import { useQuery } from '@tanstack/react-query';
import { statsApi } from '../api/stats.api';

export const OVERVIEW_STATS_KEY = 'overview_stats';

export function useOverviewStats(refetchInterval: number = 15000) {
  return useQuery({
    queryKey: [OVERVIEW_STATS_KEY],
    queryFn: () => statsApi.getOverviewStats(),
    staleTime: 10000,
    refetchInterval,
  });
}
