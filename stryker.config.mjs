/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/components/client-portal/metrics/**/*.ts',
    'src/components/client-portal/metrics/**/*.tsx',
    'src/components/client-portal/meta-ads/**/*.ts',
    'src/components/client-portal/meta-ads/**/*.tsx',
    'src/components/client-portal/email/**/*.ts',
    'src/components/client-portal/email/**/*.tsx',
    'src/hooks/**/*.ts',
    'src/hooks/**/*.tsx',
    '!src/**/*.spec.*',
    '!src/**/*.test.*',
    '!src/**/*.d.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  timeoutMS: 30000,
  concurrency: 4,
};

export default config;
