import { Violation } from '../types/violation.types';
import { formatDateTime } from './formatters';

/**
 * Exports an array of violations into a CSV formatted file and triggers browser download
 */
export function exportViolationsToCsv(violations: Violation[], filename: string = 'vdat_violations_report.csv'): void {
  if (violations.length === 0) return;

  const headers = [
    'Violation ID',
    'Camera ID',
    'Vehicle Class',
    'Track ID',
    'Frame Number',
    'Timestamp',
    'Light State',
    'Confidence',
    'Status',
    'Reviewer',
    'Review Notes',
    'Created At',
  ];

  const escapeCsv = (str?: string | number | null) => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows = violations.map((v) => [
    escapeCsv(v.id),
    escapeCsv(v.cameraId),
    escapeCsv(v.vehicleClass),
    escapeCsv(v.trackId),
    escapeCsv(v.frameNumber),
    escapeCsv(v.timestamp),
    escapeCsv(v.lightState),
    escapeCsv(v.confidence ? `${Math.round(v.confidence * 100)}%` : 'N/A'),
    escapeCsv(v.status),
    escapeCsv(v.reviewedBy?.fullName || 'Unassigned'),
    escapeCsv(v.notes || ''),
    escapeCsv(formatDateTime(v.createdAt)),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8 support

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports violation list as structured JSON file
 */
export function exportViolationsToJson(violations: Violation[], filename: string = 'vdat_violations.json'): void {
  const jsonContent = JSON.stringify(violations, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

