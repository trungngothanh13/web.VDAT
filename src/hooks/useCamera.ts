import { useQuery } from '@tanstack/react-query';
import { cameraApi } from '../api/camera.api';

export const CAMERA_DETAIL_KEY = 'camera_detail';

export function useCamera(id?: string) {
  return useQuery({
    queryKey: [CAMERA_DETAIL_KEY, id],
    queryFn: () => (id ? cameraApi.getCamera(id) : null),
    enabled: Boolean(id),
    staleTime: 20000,
  });
}

