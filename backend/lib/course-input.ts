import { z } from 'zod';
import { slug, educationLevel } from '@/lib/validation';
export const CourseInput = z.object({ slug, title: z.string().min(3).max(140), summary: z.string().max(300).optional(), description: z.string().max(20000).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'), levels: z.array(educationLevel).max(5).default([]),
  age_rating: z.enum(['all', '13_plus', '16_plus', '18_plus']).default('all'), is_free: z.boolean().default(true), price_ugx: z.number().int().min(0).max(100_000_000).default(0),
  duration_minutes: z.number().int().min(0).max(100000).optional(), tags: z.array(z.string().max(40)).max(20).default([]), cover_url: z.string().url().startsWith('https://').optional() });
