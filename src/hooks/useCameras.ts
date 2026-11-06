import { useQuery } from '@tanstack/react-query';
import { cameraApi } from '../api/camera.api';

export const CAMERAS_QUERY_KEY = 'cameras';

export function useCameras() {
  return useQuery({
    queryKey: [CAMERAS_QUERY_KEY],
    queryFn: () => cameraApi.listCameras(),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}
