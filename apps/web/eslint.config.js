import react from '@carrier-hr/eslint-config/react';

export default [
  ...react,
  {
    ignores: ['dist', 'playwright-report', 'test-results'],
  },
];
