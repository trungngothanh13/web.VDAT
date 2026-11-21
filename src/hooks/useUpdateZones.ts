import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cameraApi } from '../api/camera.api';
import { Camera, UpdateZonePayload, UpdateZoneResponse } from '../types/camera.types';
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

    onSuccess: (data: UpdateZoneResponse, variables) => {
      queryClient.setQueryData<Camera[]>([CAMERAS_QUERY_KEY], (prev) =>
        prev?.map((cam) =>
          cam.id === variables.cameraId ||
          (data.config.sourceKey && cam.activeSourceKey === data.config.sourceKey)
            ? {
                ...cam,
                activeSourceKey: data.config.sourceKey,
                activeZoneProfileId: data.config.id,
                config: data.config,
              }
            : cam
        )
      );
      void queryClient.invalidateQueries({ queryKey: [CAMERAS_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CAMERA_DETAIL_KEY, variables.cameraId] });
    },
  });
}
