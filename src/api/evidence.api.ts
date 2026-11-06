import { apiClient } from './client';
import { env } from '../config/env';
import { EvidenceUploadResponse } from '../types/api.types';

export const evidenceApi = {
  /**
   * Generates the API endpoint URL for on-demand proof clip download
   */
  getEvidenceDownloadUrl(cameraId: string, filename: string): string {
    const cleanFilename = filename.split('/').pop() || filename;
    return `${env.apiUrl}/api/evidence/download/${encodeURIComponent(cameraId)}/${encodeURIComponent(cleanFilename)}`;
  },

  /**
   * Resolves relative snapshot or clip URL (e.g. /uploads/evidence/xxx.jpg) to absolute URL
   */
  resolveMediaUrl(relativeUrl?: string | null): string {
    if (!relativeUrl) return '';
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://') || relativeUrl.startsWith('data:')) {
      return relativeUrl;
    }
    const cleanPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
    return `${env.apiUrl}${cleanPath}`;
  },

  /**
   * Downloads evidence video clip blob with optional download progress callback
   */
  async downloadClipBlob(
    cameraId: string,
    filename: string,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {
    const url = `/api/evidence/download/${encodeURIComponent(cameraId)}/${encodeURIComponent(filename)}`;
    const response = await apiClient.get<Blob>(url, {
      responseType: 'blob',
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  },

  /**
   * Upload video or snapshot evidence file (multipart form data)
   */
  async uploadEvidence(formData: FormData): Promise<EvidenceUploadResponse> {
    const { data } = await apiClient.post<EvidenceUploadResponse>('/api/evidence/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },
};

