import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { violationApi } from '../api/violation.api';
import { ViolationQueryParams } from '../types/violation.types';

export const VIOLATIONS_QUERY_KEY = 'violations';

export function useViolations(params?: ViolationQueryParams) {
  return useQuery({
    queryKey: [VIOLATIONS_QUERY_KEY, params],
    queryFn: () => violationApi.listViolations(params),
    placeholderData: keepPreviousData,
    staleTime: 10000, // 10 seconds cache
    refetchOnWindowFocus: false,
  });
}

