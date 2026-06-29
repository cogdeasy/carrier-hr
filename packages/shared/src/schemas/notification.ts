import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums.js';
import { paginatedSchema } from './common.js';

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

export const notificationListSchema = paginatedSchema(notificationSchema);
export type NotificationList = z.infer<typeof notificationListSchema>;

/** Query params for listing notifications. */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const unreadCountSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof unreadCountSchema>;

/**
 * Per-employee delivery preference for a notification category. A muted
 * category suppresses creation of new notifications of that type; existing
 * ones are unaffected.
 */
export const notificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  muted: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const notificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesSchema = z.object({
  preferences: z.array(notificationPreferenceSchema).max(NOTIFICATION_TYPES.length),
});
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

/** Groups notification types into user-facing categories for the UI. */
export const NOTIFICATION_CATEGORY: Record<(typeof NOTIFICATION_TYPES)[number], string> = {
  timeoff_request: 'Time off',
  timeoff_decision: 'Time off',
  timesheet_reminder: 'Timesheets',
  review_assigned: 'Performance',
  goal_update: 'Performance',
  document_request: 'Documents',
  onboarding_task: 'Onboarding',
  announcement: 'Announcements',
};

export const NOTIFICATION_TYPE_LABELS: Record<(typeof NOTIFICATION_TYPES)[number], string> = {
  timeoff_request: 'Time-off requests',
  timeoff_decision: 'Time-off decisions',
  timesheet_reminder: 'Timesheet reminders',
  review_assigned: 'Performance reviews',
  goal_update: 'Goal updates',
  document_request: 'Document requests',
  onboarding_task: 'Onboarding tasks',
  announcement: 'Announcements',
};
