import { useQuery } from '@tanstack/react-query';
import { violationApi } from '../api/violation.api';

export const VIOLATION_DETAIL_KEY = 'violation_detail';

export function useViolationDetails(id?: string) {
  return useQuery({
    queryKey: [VIOLATION_DETAIL_KEY, id],
    queryFn: () => (id ? violationApi.getViolation(id) : null),
    enabled: Boolean(id),
    staleTime: 30000,
  });
}
