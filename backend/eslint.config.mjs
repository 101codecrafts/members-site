import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['node_modules/**', '.next/**', 'public/**', 'types/database.ts'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      'no-restricted-imports': ['error', { paths: [{ name: '@/lib/supabase/admin', message: 'service-role client: import only from services/ that run in webhooks, cron or privacy jobs (see docs/BACKEND.md).' }] }],
    },
  },
  { files: ['services/**/*.ts', 'lib/supabase/admin.ts', 'lib/ratelimit.ts', 'lib/monitoring.ts', 'app/api/v1/webhooks/**', 'app/api/v1/cron/**'], rules: { 'no-restricted-imports': 'off' } },
);
