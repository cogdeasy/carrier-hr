import { getClient } from './client.js';

const TABLES = [
  'audit_logs',
  'notifications',
  'documents',
  'course_enrollments',
  'courses',
  'onboarding_tasks',
  'candidates',
  'job_requisitions',
  'one_on_ones',
  'reviews',
  'review_cycles',
  'goals',
  'benefit_enrollments',
  'benefit_plans',
  'payslips',
  'compensations',
  'timesheet_entries',
  'timesheets',
  'company_holidays',
  'time_off_requests',
  'time_off_balances',
  'user_roles',
  'users',
  'employees',
];

async function reset(): Promise<void> {
  const client = getClient();
  for (const table of TABLES) {
    await client.execute(`DELETE FROM ${table};`);
  }
  console.log('Database cleared.');
  client.close();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
