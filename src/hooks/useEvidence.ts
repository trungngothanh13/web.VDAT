import { useState, useCallback } from 'react';
import { evidenceApi } from '../api/evidence.api';

export function useEvidence() {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  /**
   * Resolves a media file path (e.g. /uploads/evidence/xxx.jpg) to an absolute URL
   */
  const resolveUrl = useCallback((path?: string | null) => {
    return evidenceApi.resolveMediaUrl(path);
  }, []);

  /**
   * Downloads proof video file directly to user's computer via browser
   */
  const downloadVideo = useCallback(
    async (cameraId: string, filename: string, customDownloadName?: string) => {
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadError(null);

      try {
        const cleanName = filename.split('/').pop() || filename;
        const blob = await evidenceApi.downloadClipBlob(cameraId, cleanName, (percent) => {
          setDownloadProgress(percent);
        });

        // Trigger browser save dialog
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = customDownloadName || cleanName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);

        setIsDownloading(false);
        setDownloadProgress(null);
      } catch (err: any) {
        setIsDownloading(false);
        setDownloadProgress(null);
        setDownloadError(err.message || 'Failed to download evidence video clip');
        throw err;
      }
    },
    []
  );

  return {
    resolveUrl,
    downloadVideo,
    isDownloading,
    downloadProgress,
    downloadError,
  };
}

