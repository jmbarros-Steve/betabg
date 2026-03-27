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
    'src/components/client-portal/KeyboardShortcutsDialog.tsx',
    'src/components/client-portal/TabCoachmark.tsx',
    'src/components/client-portal/Coachmark.tsx',
    'src/components/client-portal/SuccessCelebration.tsx',
    'src/components/client-portal/FormDraftSaver.tsx',
    'src/components/client-portal/LoadingWithMessage.tsx',
    'src/components/client-portal/EmptyState.tsx',
    'src/components/client-portal/SetupProgressTracker.tsx',
    'src/components/client-portal/StructuredFieldsForm.tsx',
    'src/components/client-portal/SteveAcademy.tsx',
    'src/hooks/**/*.ts',
    'src/hooks/**/*.tsx',
    '!src/**/*.spec.*',
    '!src/**/*.test.*',
    '!src/**/*.d.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 40,
  },
  timeoutMS: 30000,
  concurrency: 4,
};

export default config;
