import { z } from 'zod';

export const reviewViolationSchema = z.object({
  status: z.enum(['CONFIRMED', 'DISMISSED'], {
    errorMap: () => ({ message: 'Status must be either CONFIRMED or DISMISSED' }),
  }),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});

export type ReviewViolationFormData = z.infer<typeof reviewViolationSchema>;

export const violationFilterSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  cameraId: z.string().optional(),
  status: z.enum(['PENDING_REVIEW', 'CONFIRMED', 'DISMISSED']).optional(),
  vehicleClass: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export type ViolationFilterData = z.infer<typeof violationFilterSchema>;

