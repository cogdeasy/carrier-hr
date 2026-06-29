import type { Role } from '@carrier-hr/shared';
import { getEnv } from '../env.js';
import { hashPassword } from '../auth/password.js';
import { businessDaysBetween } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { getClient, getDb, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import {
  BENEFIT_PLANS,
  COURSES,
  DEPARTMENTS,
  FIRST_NAMES,
  HOLIDAYS_2026,
  LAST_NAMES,
  LOCATIONS,
  ONBOARDING_TEMPLATE,
  TITLES_BY_DEPARTMENT,
} from './seed-data.js';
import * as t from './schema.js';

/** Tiny deterministic PRNG so the seed is reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260629);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const randInt = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;

interface SeedEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  location: string;
  managerId: string | null;
  hireDate: string;
  status: string;
  gender: string;
  roles: Role[];
  password?: string;
}

const employees: SeedEmployee[] = [];
let empCounter = 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

function addEmployee(e: Omit<SeedEmployee, 'id' | 'employeeNumber'> & { id?: string }): SeedEmployee {
  empCounter += 1;
  const emp: SeedEmployee = {
    ...e,
    id: e.id ?? createId('emp'),
    employeeNumber: `C${empCounter}`,
  };
  employees.push(emp);
  return emp;
}

function makeEmail(first: string, last: string): string {
  return `${first}.${last}`.toLowerCase().replace(/[^a-z.]/gu, '') + '@carrier.com';
}

function buildOrg(): void {
  // --- Leadership & stable personas (used for login + e2e tests) ---
  const ceo = addEmployee({
    id: createId('emp'),
    firstName: 'David',
    lastName: 'Gitlin',
    email: 'david.gitlin@carrier.com',
    jobTitle: 'Chief Executive Officer',
    department: 'Executive',
    location: LOCATIONS[0]!,
    managerId: null,
    hireDate: '2016-04-01',
    status: 'active',
    gender: 'Male',
    roles: ['executive'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  const admin = addEmployee({
    firstName: 'Ada',
    lastName: 'Sysadmin',
    email: 'admin@carrier.com',
    jobTitle: 'IT Director',
    department: 'Information Technology',
    location: LOCATIONS[0]!,
    managerId: ceo.id,
    hireDate: '2017-02-15',
    status: 'active',
    gender: 'Female',
    roles: ['super_admin'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  const hrHead = addEmployee({
    firstName: 'Patricia',
    lastName: 'Reyes',
    email: 'hr.admin@carrier.com',
    jobTitle: 'Chief Human Resources Officer',
    department: 'Human Resources',
    location: LOCATIONS[0]!,
    managerId: ceo.id,
    hireDate: '2018-06-11',
    status: 'active',
    gender: 'Female',
    roles: ['hr_admin'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  const recruiter = addEmployee({
    firstName: 'Rachel',
    lastName: 'Greene',
    email: 'recruiter@carrier.com',
    jobTitle: 'Talent Acquisition Lead',
    department: 'Human Resources',
    location: LOCATIONS[1]!,
    managerId: hrHead.id,
    hireDate: '2020-09-01',
    status: 'active',
    gender: 'Female',
    roles: ['recruiter'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  const engManager = addEmployee({
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'manager@carrier.com',
    jobTitle: 'Engineering Manager',
    department: 'Engineering',
    location: LOCATIONS[1]!,
    managerId: ceo.id,
    hireDate: '2019-03-18',
    status: 'active',
    gender: 'Male',
    roles: ['manager'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  const employee = addEmployee({
    firstName: 'Emma',
    lastName: 'Wilson',
    email: 'employee@carrier.com',
    jobTitle: 'Senior Software Engineer',
    department: 'Engineering',
    location: LOCATIONS[1]!,
    managerId: engManager.id,
    hireDate: '2021-07-12',
    status: 'active',
    gender: 'Female',
    roles: ['employee'],
    password: getEnv().SEED_DEFAULT_PASSWORD,
  });

  // Department heads reporting to the CEO.
  const deptHeads = new Map<string, SeedEmployee>();
  deptHeads.set('Engineering', engManager);
  deptHeads.set('Human Resources', hrHead);
  for (const dept of DEPARTMENTS) {
    if (dept === 'Executive' || deptHeads.has(dept)) continue;
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const head = addEmployee({
      firstName: first,
      lastName: last,
      email: makeEmail(`${first}.${dept.slice(0, 3)}`, last),
      jobTitle: `${dept} Director`,
      department: dept,
      location: pick(LOCATIONS),
      managerId: ceo.id,
      hireDate: daysAgo(randInt(800, 2500)),
      status: 'active',
      gender: pick(['Male', 'Female']),
      roles: ['manager'],
    });
    deptHeads.set(dept, head);
  }

  // Individual contributors.
  for (let i = 0; i < 64; i += 1) {
    const dept = pick(DEPARTMENTS.filter((d) => d !== 'Executive'));
    const head = deptHeads.get(dept)!;
    const titles = TITLES_BY_DEPARTMENT[dept] ?? ['Specialist'];
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const status = rand() < 0.06 ? 'on_leave' : rand() < 0.04 ? 'terminated' : 'active';
    addEmployee({
      firstName: first,
      lastName: last,
      email: makeEmail(`${first}${i}`, last),
      jobTitle: pick(titles),
      department: dept,
      location: pick(LOCATIONS),
      managerId: head.id,
      hireDate: daysAgo(randInt(20, 2200)),
      status,
      gender: pick(['Male', 'Female', 'Female', 'Male']),
      roles: ['employee'],
    });
  }

  // Reference the seeded personas to keep references explicit.
  void [admin, recruiter, employee];
}

async function insertEmployees(db: Database): Promise<void> {
  const password = getEnv().SEED_DEFAULT_PASSWORD;
  for (const e of employees) {
    await db.insert(t.employees).values({
      id: e.id,
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      workPhone: `+1-561-555-${String(randInt(1000, 9999))}`,
      jobTitle: e.jobTitle,
      department: e.department,
      division: 'Carrier',
      location: e.location,
      employmentType: 'full_time',
      status: e.status,
      managerId: e.managerId,
      hireDate: e.hireDate,
      terminationDate: e.status === 'terminated' ? daysAgo(randInt(5, 120)) : null,
      gender: e.gender,
      avatarUrl: null,
      address: JSON.stringify({
        line1: `${randInt(100, 9999)} Main St`,
        city: e.location.split(',')[0],
        state: (e.location.split(',')[1] ?? 'FL').trim(),
        postalCode: String(randInt(10000, 99999)),
        country: 'USA',
      }),
      emergencyContact: JSON.stringify({
        name: `${pick(FIRST_NAMES)} ${e.lastName}`,
        relationship: pick(['Spouse', 'Parent', 'Sibling', 'Partner']),
        phone: `+1-561-555-${String(randInt(1000, 9999))}`,
      }),
    });

    const hash = await hashPassword(e.password ?? password);
    const userId = createId('usr');
    await db.insert(t.users).values({
      id: userId,
      employeeId: e.id,
      email: e.email,
      passwordHash: hash,
      mustChangePassword: false,
    });
    for (const role of e.roles) {
      await db.insert(t.userRoles).values({ id: createId('rol'), userId, role });
    }
  }
}

async function seedSupporting(db: Database): Promise<void> {
  const year = 2026;
  const active = employees.filter((e) => e.status !== 'terminated');

  // Holidays
  for (const h of HOLIDAYS_2026) {
    await db.insert(t.companyHolidays).values({ id: createId('hol'), name: h.name, date: h.date, region: 'US' });
  }

  // Benefit plans
  const planIds: string[] = [];
  for (const p of BENEFIT_PLANS) {
    const id = createId('plan');
    planIds.push(id);
    await db.insert(t.benefitPlans).values({ id, planYear: year, ...p });
  }

  // Courses
  const courseIds: { id: string; required: boolean }[] = [];
  for (const c of COURSES) {
    const id = createId('crs');
    courseIds.push({ id, required: c.required });
    await db.insert(t.courses).values({
      id,
      title: c.title,
      category: c.category,
      description: c.description,
      provider: 'Carrier University',
      durationMinutes: c.durationMinutes,
      required: c.required,
    });
  }

  // Time-off balances for everyone
  const balanceMap: Record<string, number> = { vacation: 20, sick: 10, personal: 5 };
  for (const e of active) {
    for (const [type, accrued] of Object.entries(balanceMap)) {
      await db.insert(t.timeOffBalances).values({
        id: createId('tob'),
        employeeId: e.id,
        type,
        accruedDays: accrued,
        usedDays: randInt(0, Math.floor(accrued / 2)),
        year,
      });
    }
  }

  // Compensation + a few payslips per employee
  for (const e of active) {
    const base = randInt(60000, 220000);
    await db.insert(t.compensations).values({
      id: createId('cmp'),
      employeeId: e.id,
      annualSalaryCents: base * 100,
      currency: 'USD',
      payFrequency: 'biweekly',
      effectiveDate: e.hireDate,
    });

    const grossPerPeriod = Math.round((base * 100) / 26);
    for (let p = 0; p < 3; p += 1) {
      const tax = Math.round(grossPerPeriod * 0.22);
      const deductions = Math.round(grossPerPeriod * 0.08);
      const net = grossPerPeriod - tax - deductions;
      const periodEndDate = new Date();
      periodEndDate.setUTCDate(periodEndDate.getUTCDate() - p * 14);
      const periodStartDate = new Date(periodEndDate);
      periodStartDate.setUTCDate(periodStartDate.getUTCDate() - 13);
      await db.insert(t.payslips).values({
        id: createId('pay'),
        employeeId: e.id,
        periodStart: isoDate(periodStartDate),
        periodEnd: isoDate(periodEndDate),
        payDate: isoDate(periodEndDate),
        status: 'paid',
        currency: 'USD',
        grossCents: grossPerPeriod,
        netCents: net,
        totalDeductionsCents: deductions,
        totalTaxCents: tax,
        lines: JSON.stringify([
          { label: 'Base Salary', type: 'earning', amountCents: grossPerPeriod },
          { label: 'Federal Income Tax', type: 'tax', amountCents: -Math.round(tax * 0.7) },
          { label: 'State Income Tax', type: 'tax', amountCents: -Math.round(tax * 0.3) },
          { label: 'Medical Premium', type: 'deduction', amountCents: -Math.round(deductions * 0.6) },
          { label: '401(k) Contribution', type: 'deduction', amountCents: -Math.round(deductions * 0.4) },
        ]),
      });
    }

    // Benefit enrollments for a subset
    if (rand() < 0.8) {
      await db.insert(t.benefitEnrollments).values({
        id: createId('ben'),
        employeeId: e.id,
        planId: pick(planIds),
        status: 'enrolled',
        electedAt: new Date().toISOString(),
        dependents: randInt(0, 3),
      });
    }

    // Course enrollments (always enroll in required courses)
    for (const c of courseIds) {
      if (c.required || rand() < 0.3) {
        const progress = c.required ? pick([100, 100, 60, 0]) : pick([0, 40, 100]);
        const status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started';
        await db.insert(t.courseEnrollments).values({
          id: createId('enr'),
          employeeId: e.id,
          courseId: c.id,
          status,
          progress,
          completedAt: status === 'completed' ? daysAgo(randInt(1, 60)) : null,
        });
      }
    }

    // A couple of goals each
    for (let g = 0; g < randInt(1, 3); g += 1) {
      const progress = randInt(0, 100);
      await db.insert(t.goals).values({
        id: createId('goal'),
        employeeId: e.id,
        title: pick([
          'Improve team delivery velocity by 15%',
          'Complete leadership development program',
          'Reduce production incidents by 20%',
          'Launch customer satisfaction initiative',
          'Mentor two junior team members',
        ]),
        description: 'Aligned with annual department objectives.',
        status: progress >= 100 ? 'completed' : progress > 70 ? 'active' : 'at_risk',
        progress,
        dueDate: '2026-12-31',
      });
    }
  }

  // Review cycle + reviews for employees with managers
  const cycleId = createId('cyc');
  await db.insert(t.reviewCycles).values({
    id: cycleId,
    name: 'Mid-Year Review 2026',
    status: 'active',
    startDate: '2026-06-01',
    endDate: '2026-07-15',
  });
  for (const e of active) {
    if (!e.managerId) continue;
    if (rand() < 0.5) continue;
    await db.insert(t.reviews).values({
      id: createId('rev'),
      cycleId,
      employeeId: e.id,
      reviewerId: e.managerId,
      status: pick(['not_started', 'self_review', 'manager_review']),
      selfAssessment: null,
      managerAssessment: null,
      overallRating: null,
    });
  }

  // Time-off requests (pending ones routed to managers for approval testing)
  for (const e of active) {
    if (!e.managerId) continue;
    if (rand() < 0.4) {
      const start = daysAgo(-randInt(7, 40));
      const end = daysAgo(-(randInt(1, 6) + 7));
      const startIso = start < end ? start : end;
      const endIso = start < end ? end : start;
      const total = Math.max(1, businessDaysBetween(startIso, endIso));
      await db.insert(t.timeOffRequests).values({
        id: createId('tor'),
        employeeId: e.id,
        type: pick(['vacation', 'sick', 'personal']),
        startDate: startIso,
        endDate: endIso,
        totalDays: total,
        reason: pick(['Family vacation', 'Medical appointment', 'Personal day', 'Travel']),
        status: 'pending',
        approverId: e.managerId,
      });
    }
  }

  // Recruiting: jobs + candidates
  const recruiter = employees.find((e) => e.email === 'recruiter@carrier.com')!;
  for (let j = 0; j < 8; j += 1) {
    const dept = pick(DEPARTMENTS.filter((d) => d !== 'Executive'));
    const titles = TITLES_BY_DEPARTMENT[dept] ?? ['Specialist'];
    const jobId = createId('job');
    const min = randInt(60, 120) * 1000;
    await db.insert(t.jobRequisitions).values({
      id: jobId,
      title: pick(titles),
      department: dept,
      location: pick(LOCATIONS),
      employmentType: 'full_time',
      status: pick(['open', 'open', 'draft', 'closed']),
      description: 'We are seeking a talented professional to join our growing team at Carrier.',
      recruiterId: recruiter.id,
      openings: randInt(1, 3),
      postedDate: daysAgo(randInt(3, 45)),
      salaryMinCents: min * 100,
      salaryMaxCents: (min + randInt(20, 60) * 1000) * 100,
    });
    for (let c = 0; c < randInt(2, 8); c += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      await db.insert(t.candidates).values({
        id: createId('cand'),
        jobId,
        firstName: first,
        lastName: last,
        email: makeEmail(`${first}.cand${c}${j}`, last),
        phone: `+1-555-555-${String(randInt(1000, 9999))}`,
        stage: pick(['applied', 'applied', 'screening', 'interview', 'offer']),
        source: pick(['LinkedIn', 'Referral', 'Career Site', 'Indeed']),
        rating: rand() < 0.5 ? randInt(2, 5) : null,
      });
    }
  }

  // Onboarding tasks for recent hires
  const recentHires = active
    .filter((e) => e.hireDate >= daysAgo(120))
    .slice(0, 12);
  for (const e of recentHires) {
    for (let idx = 0; idx < ONBOARDING_TEMPLATE.length; idx += 1) {
      const task = ONBOARDING_TEMPLATE[idx]!;
      const done = rand() < 0.5;
      await db.insert(t.onboardingTasks).values({
        id: createId('onb'),
        employeeId: e.id,
        title: task.title,
        category: task.category,
        assigneeRole: task.assigneeRole,
        status: done ? 'completed' : 'pending',
        completedAt: done ? daysAgo(randInt(1, 30)) : null,
        orderIndex: idx,
      });
    }
  }

  // Documents (company-wide + personal)
  await db.insert(t.documents).values({
    id: createId('doc'),
    employeeId: null,
    name: 'Employee Handbook 2026.pdf',
    category: 'Policy',
    contentType: 'application/pdf',
    sizeBytes: 2_400_000,
    url: 'https://files.carrier.example/handbook-2026.pdf',
    requiresSignature: true,
    uploadedById: employees.find((e) => e.email === 'hr.admin@carrier.com')!.id,
  });

  // Notifications for the demo employee + manager
  const emp = employees.find((e) => e.email === 'employee@carrier.com')!;
  const mgr = employees.find((e) => e.email === 'manager@carrier.com')!;
  await db.insert(t.notifications).values({
    id: createId('ntf'),
    employeeId: emp.id,
    type: 'announcement',
    title: 'Welcome to Carrier HR',
    body: 'Open enrollment for 2026 benefits is now available.',
    link: '/benefits',
    read: false,
  });
  await db.insert(t.notifications).values({
    id: createId('ntf'),
    employeeId: mgr.id,
    type: 'timeoff_request',
    title: 'Pending approvals',
    body: 'You have time-off requests awaiting your review.',
    link: '/time-off/approvals',
    read: false,
  });
}

async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();
  buildOrg();
  console.log(`Seeding ${employees.length} employees...`);
  await insertEmployees(db);
  await seedSupporting(db);
  console.log('Seed complete.');
  console.log('Logins (password = SEED_DEFAULT_PASSWORD):');
  console.log('  admin@carrier.com (super_admin)');
  console.log('  david.gitlin@carrier.com (executive)');
  console.log('  hr.admin@carrier.com (hr_admin)');
  console.log('  recruiter@carrier.com (recruiter)');
  console.log('  manager@carrier.com (manager)');
  console.log('  employee@carrier.com (employee)');
  getClient().close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
