import { z } from 'zod';

const pointSchema = z.tuple([z.number(), z.number()]);
const polygonSchema = z.array(pointSchema).min(3, 'A polygon must have at least 3 coordinate points');

const lightBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  color: z.enum(['red', 'green', 'yellow']).optional(),
});

export const updateZoneSchema = z.object({
  lanes: z.array(polygonSchema).min(1, 'At least one lane polygon is required'),
  intersection: polygonSchema,
  lightBox: z.array(lightBoxSchema).optional(),
});

export type UpdateZoneFormData = z.infer<typeof updateZoneSchema>;

