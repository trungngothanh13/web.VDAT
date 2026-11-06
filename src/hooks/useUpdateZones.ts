import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cameraApi } from '../api/camera.api';
import { UpdateZonePayload, UpdateZoneResponse } from '../types/camera.types';
import { CAMERAS_QUERY_KEY } from './useCameras';
import { CAMERA_DETAIL_KEY } from './useCamera';

export function useUpdateZones() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cameraId,
      payload,
    }: {
      cameraId: string;
      payload: UpdateZonePayload;
    }) => cameraApi.updateZoneConfig(cameraId, payload),

    onSuccess: (_data: UpdateZoneResponse, variables) => {
      queryClient.invalidateQueries({ queryKey: [CAMERAS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [CAMERA_DETAIL_KEY, variables.cameraId] });
    },
  });
}
