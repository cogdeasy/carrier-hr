/** Static reference data for the Collins Aerospace HR seed. */

export const LOCATIONS = [
  'Charlotte, NC',
  'Cedar Rapids, IA',
  'Windsor Locks, CT',
  'Rockford, IL',
  'Richardson, TX',
  'Phoenix, AZ',
  'Reading, UK',
  'Toulouse, FR',
];

// Collins Aerospace strategic business units.
export const DIVISIONS = [
  'Avionics',
  'Mission Systems',
  'Power & Controls',
  'Interiors',
  'Aerostructures',
  'Connected Aviation Solutions',
];

export const DEPARTMENTS = [
  'Executive',
  'Human Resources',
  'Engineering',
  'Product',
  'Sales',
  'Marketing',
  'Finance',
  'Operations',
  'Supply Chain',
  'Information Technology',
  'Customer Service',
  'Legal',
];

export const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
  'Anthony', 'Margaret', 'Mark', 'Betty', 'Donald', 'Sandra', 'Steven', 'Ashley',
  'Andrew', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna', 'Kevin', 'Michelle',
  'Brian', 'Carol', 'George', 'Amanda', 'Timothy', 'Melissa', 'Ronald', 'Deborah',
  'Wei', 'Mei', 'Carlos', 'Sofia', 'Raj', 'Priya', 'Ahmed', 'Fatima',
];

export const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Chen', 'Wang', 'Kumar', 'Patel', 'Khan', 'Singh', 'Nakamura', 'Okafor',
];

export const TITLES_BY_DEPARTMENT: Record<string, string[]> = {
  Executive: ['Chief Executive Officer', 'Chief Operating Officer', 'Chief Financial Officer'],
  'Human Resources': ['HR Business Partner', 'Talent Acquisition Specialist', 'HR Generalist', 'Compensation Analyst'],
  Engineering: ['Software Engineer', 'Senior Software Engineer', 'Staff Engineer', 'Engineering Manager', 'QA Engineer'],
  Product: ['Product Manager', 'Senior Product Manager', 'Product Designer', 'UX Researcher'],
  Sales: ['Account Executive', 'Sales Director', 'Sales Development Rep', 'Regional Sales Manager'],
  Marketing: ['Marketing Manager', 'Content Strategist', 'Demand Generation Specialist', 'Brand Manager'],
  Finance: ['Financial Analyst', 'Controller', 'Accountant', 'FP&A Manager'],
  Operations: ['Operations Manager', 'Plant Supervisor', 'Process Engineer', 'Operations Analyst'],
  'Supply Chain': ['Supply Chain Analyst', 'Procurement Specialist', 'Logistics Coordinator', 'Sourcing Manager'],
  'Information Technology': ['Systems Administrator', 'IT Support Specialist', 'Security Engineer', 'IT Director'],
  'Customer Service': ['Customer Success Manager', 'Support Specialist', 'Service Coordinator'],
  Legal: ['Corporate Counsel', 'Compliance Manager', 'Paralegal'],
};

export const BENEFIT_PLANS = [
  {
    type: 'medical' as const,
    name: 'Collins PPO Premier',
    carrier: 'UnitedHealthcare',
    description: 'Comprehensive PPO with nationwide network and low deductibles.',
    monthlyPremiumCents: 62000,
    employerContributionCents: 49600,
    coverageLevel: 'Employee + Family',
  },
  {
    type: 'medical' as const,
    name: 'Collins HDHP + HSA',
    carrier: 'UnitedHealthcare',
    description: 'High-deductible health plan paired with a tax-advantaged HSA.',
    monthlyPremiumCents: 41000,
    employerContributionCents: 36000,
    coverageLevel: 'Employee Only',
  },
  {
    type: 'dental' as const,
    name: 'Delta Dental PPO',
    carrier: 'Delta Dental',
    description: 'Preventive, basic and major dental coverage with orthodontia.',
    monthlyPremiumCents: 4800,
    employerContributionCents: 3600,
    coverageLevel: 'Employee + Family',
  },
  {
    type: 'vision' as const,
    name: 'VSP Vision Plus',
    carrier: 'VSP',
    description: 'Annual eye exams, lenses, frames and contact allowances.',
    monthlyPremiumCents: 1500,
    employerContributionCents: 1200,
    coverageLevel: 'Employee + Family',
  },
  {
    type: 'life' as const,
    name: 'Basic Life & AD&D',
    carrier: 'MetLife',
    description: 'Company-paid life insurance at 2x annual base salary.',
    monthlyPremiumCents: 0,
    employerContributionCents: 2200,
    coverageLevel: 'Employee Only',
  },
  {
    type: 'retirement_401k' as const,
    name: 'Collins 401(k) Savings Plan',
    carrier: 'Fidelity',
    description: 'Pre-tax and Roth contributions with 6% company match.',
    monthlyPremiumCents: 0,
    employerContributionCents: 0,
    coverageLevel: 'Employee Only',
  },
];

export const COURSES = [
  { title: 'Code of Ethics & Business Conduct', category: 'Compliance', required: true, durationMinutes: 45, description: 'Annual mandatory ethics and compliance training for all employees.' },
  { title: 'Workplace Safety Fundamentals', category: 'Safety', required: true, durationMinutes: 60, description: 'OSHA-aligned safety practices for office and plant environments.' },
  { title: 'Information Security Awareness', category: 'Security', required: true, durationMinutes: 30, description: 'Phishing, data handling and security best practices.' },
  { title: 'Preventing Workplace Harassment', category: 'Compliance', required: true, durationMinutes: 50, description: 'Respectful workplace and anti-harassment training.' },
  { title: 'Leadership Essentials', category: 'Leadership', required: false, durationMinutes: 120, description: 'Core people-management skills for new managers.' },
  { title: 'Aerospace Systems Fundamentals', category: 'Technical', required: false, durationMinutes: 90, description: 'Introduction to avionics, mission systems and aircraft integration.' },
  { title: 'Lean Six Sigma Yellow Belt', category: 'Operations', required: false, durationMinutes: 180, description: 'Process improvement methodology and tools.' },
  { title: 'Effective Communication', category: 'Professional', required: false, durationMinutes: 75, description: 'Written and verbal communication in the workplace.' },
];

export const HOLIDAYS_2026 = [
  { name: "New Year's Day", date: '2026-01-01' },
  { name: 'Martin Luther King Jr. Day', date: '2026-01-19' },
  { name: 'Presidents Day', date: '2026-02-16' },
  { name: 'Memorial Day', date: '2026-05-25' },
  { name: 'Juneteenth', date: '2026-06-19' },
  { name: 'Independence Day', date: '2026-07-03' },
  { name: 'Labor Day', date: '2026-09-07' },
  { name: 'Thanksgiving Day', date: '2026-11-26' },
  { name: 'Day after Thanksgiving', date: '2026-11-27' },
  { name: 'Christmas Eve', date: '2026-12-24' },
  { name: 'Christmas Day', date: '2026-12-25' },
];

export interface TemplateItemSeed {
  title: string;
  description?: string;
  category: string;
  assigneeRole: 'employee' | 'manager' | 'super_admin' | 'hr_admin';
  dueOffsetDays: number;
}

export const ONBOARDING_TEMPLATE_ITEMS: TemplateItemSeed[] = [
  {
    title: 'Sign employment agreement',
    description: 'Review and e-sign your offer and employment agreement.',
    category: 'Paperwork',
    assigneeRole: 'employee',
    dueOffsetDays: 0,
  },
  {
    title: 'Complete I-9 verification',
    category: 'Paperwork',
    assigneeRole: 'hr_admin',
    dueOffsetDays: 3,
  },
  { title: 'Set up direct deposit', category: 'Payroll', assigneeRole: 'employee', dueOffsetDays: 5 },
  { title: 'Enroll in benefits', category: 'Benefits', assigneeRole: 'employee', dueOffsetDays: 14 },
  {
    title: 'Provision laptop and accounts',
    description: 'Issue hardware and create email, SSO and VPN accounts.',
    category: 'IT',
    assigneeRole: 'super_admin',
    dueOffsetDays: 0,
  },
  {
    title: 'Complete required compliance training',
    category: 'Training',
    assigneeRole: 'employee',
    dueOffsetDays: 14,
  },
  { title: 'Meet your team', category: 'Culture', assigneeRole: 'manager', dueOffsetDays: 2 },
  { title: '30-day check-in', category: 'Culture', assigneeRole: 'manager', dueOffsetDays: 30 },
];

export const OFFBOARDING_TEMPLATE_ITEMS: TemplateItemSeed[] = [
  {
    title: 'Return laptop and badge',
    description: 'Collect all company hardware and access badges.',
    category: 'Asset Return',
    assigneeRole: 'employee',
    dueOffsetDays: 0,
  },
  {
    title: 'Return mobile device and peripherals',
    category: 'Asset Return',
    assigneeRole: 'employee',
    dueOffsetDays: 0,
  },
  {
    title: 'Revoke SSO and email access',
    description: 'Disable accounts at end of last working day.',
    category: 'Access Revocation',
    assigneeRole: 'super_admin',
    dueOffsetDays: 0,
  },
  {
    title: 'Revoke building and VPN access',
    category: 'Access Revocation',
    assigneeRole: 'super_admin',
    dueOffsetDays: 0,
  },
  {
    title: 'Conduct exit interview',
    category: 'HR',
    assigneeRole: 'hr_admin',
    dueOffsetDays: -2,
  },
  {
    title: 'Process final pay and PTO payout',
    category: 'Payroll',
    assigneeRole: 'hr_admin',
    dueOffsetDays: 3,
  },
  {
    title: 'Knowledge transfer and handover',
    category: 'Transition',
    assigneeRole: 'manager',
    dueOffsetDays: -5,
  },
];
