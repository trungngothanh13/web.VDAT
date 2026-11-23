import { useMutation, useQueryClient } from '@tanstack/react-query';
import { violationApi } from '../api/violation.api';
import { UpdateViolationStatusPayload, Violation } from '../types/violation.types';
import { useViolationStore } from '../stores/violation.store';
import { VIOLATIONS_QUERY_KEY } from './useViolations';
import { OVERVIEW_STATS_KEY } from './useOverviewStats';

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
      updateViolationInStore(updatedRecord);
      void queryClient.invalidateQueries({ queryKey: [VIOLATIONS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [OVERVIEW_STATS_KEY] });
    },
  });
}
