import { format, formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Formats ISO date string to localized date time: "16 Oct 2026, 14:32:05"
 */
export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const date = parseISO(dateString);
    return format(date, 'dd MMM yyyy, HH:mm:ss');
  } catch {
    return dateString;
  }
}

/**
 * Formats ISO date string to short date: "16/10/2026"
 */
export function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const date = parseISO(dateString);
    return format(date, 'dd/MM/yyyy');
  } catch {
    return dateString;
  }
}

/**
 * Returns human-friendly relative time: "2 minutes ago"
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const date = parseISO(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return dateString;
  }
}

/**
 * Formats confidence score (0.0 to 1.0) into percentage: "94%"
 */
export function formatConfidence(confidence?: number | null): string {
  if (confidence === null || confidence === undefined) return 'N/A';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Formats video timestamp e.g. "19.97s" or frame number
 */
export function formatVideoTime(timestamp?: string | null, frameNumber?: number): string {
  if (timestamp && timestamp.includes('s')) {
    return timestamp;
  }
  if (frameNumber !== undefined) {
    return `Frame #${frameNumber}`;
  }
  return '—';
}

/**
 * Capitalizes first letter of string
 */
export function capitalize(str?: string | null): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
