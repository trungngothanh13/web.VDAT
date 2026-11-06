import { useMutation, useQueryClient } from '@tanstack/react-query';
import { violationApi } from '../api/violation.api';
import { UpdateViolationStatusPayload, Violation } from '../types/violation.types';
import { useViolationStore } from '../stores/violation.store';
import { VIOLATIONS_QUERY_KEY } from './useViolations';
import { VIOLATION_DETAIL_KEY } from './useViolationDetails';

export function useReviewViolation() {
  const queryClient = useQueryClient();
  const updateViolationInStore = useViolationStore((s) => s.updateViolationInStore);

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateViolationStatusPayload;
    }) => violationApi.updateViolationStatus(id, payload),

    onSuccess: (updatedRecord: Violation) => {
      // 1. Update Zustand store
      updateViolationInStore(updatedRecord);

      // 2. Invalidate violation queries
      queryClient.invalidateQueries({ queryKey: [VIOLATIONS_QUERY_KEY] });
      queryClient.setQueryData([VIOLATION_DETAIL_KEY, updatedRecord.id], updatedRecord);
      queryClient.invalidateQueries({ queryKey: ['overview_stats'] });
    },
  });
}
