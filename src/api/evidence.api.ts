import { env } from '../config/env';

export const evidenceApi = {
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
};
