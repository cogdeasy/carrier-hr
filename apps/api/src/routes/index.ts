import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.routes.js';
import { meRoutes } from './me.routes.js';
import { employeeRoutes } from './employees.routes.js';
import { timeOffRoutes } from './timeoff.routes.js';
import { notificationRoutes } from './notifications.routes.js';
import { analyticsRoutes } from './analytics.routes.js';
import { timesheetRoutes } from './timesheets.routes.js';
import { payrollRoutes } from './payroll.routes.js';
import { benefitsRoutes } from './benefits.routes.js';
import { performanceRoutes } from './performance.routes.js';
import { recruitingRoutes } from './recruiting.routes.js';
import { onboardingRoutes } from './onboarding.routes.js';
import { learningRoutes } from './learning.routes.js';
import { documentRoutes } from './documents.routes.js';

/**
 * Mounts every feature route group under the `/api` prefix. Each group is a
 * self-contained Fastify plugin so modules stay decoupled.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(employeeRoutes, { prefix: '/employees' });
  await app.register(timeOffRoutes, { prefix: '/time-off' });
  await app.register(timesheetRoutes, { prefix: '/timesheets' });
  await app.register(payrollRoutes, { prefix: '/payroll' });
  await app.register(benefitsRoutes, { prefix: '/benefits' });
  await app.register(performanceRoutes, { prefix: '/performance' });
  await app.register(recruitingRoutes, { prefix: '/recruiting' });
  await app.register(onboardingRoutes, { prefix: '/onboarding' });
  await app.register(learningRoutes, { prefix: '/learning' });
  await app.register(documentRoutes, { prefix: '/documents' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(analyticsRoutes, { prefix: '/analytics' });
}
