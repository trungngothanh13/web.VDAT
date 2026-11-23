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
 * Returns compact relative time: "just now", "1 min ago", "5 mins ago", "2 hrs ago"
 */
export function formatShortRelativeTime(dateString?: string | null, nowMs: number = Date.now()): string {
  if (!dateString) return 'just now';
  try {
    const parsed = parseISO(dateString).getTime();
    if (Number.isNaN(parsed)) return 'just now';
    const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'min' : 'mins'} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hr' : 'hrs'} ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;
  } catch {
    return 'just now';
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

