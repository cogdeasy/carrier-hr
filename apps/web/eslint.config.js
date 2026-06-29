import react from '@collins-hr/eslint-config/react';

export default [
  ...react,
  {
    ignores: ['dist', 'playwright-report', 'test-results'],
  },
];
