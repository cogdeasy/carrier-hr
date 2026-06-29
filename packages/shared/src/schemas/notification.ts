import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums.js';

export const notificationSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;
