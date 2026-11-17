import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cameraApi } from '../api/camera.api';

export const CAMERAS_QUERY_KEY = 'cameras';

export function useCameras(enabled: boolean = true) {
  return useQuery({
    queryKey: [CAMERAS_QUERY_KEY],
    queryFn: () => cameraApi.listCameras(),
    enabled,
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

export function useCreateCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; name: string; location?: string }) =>
      cameraApi.createCamera(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CAMERAS_QUERY_KEY] });
    },
  });
}

