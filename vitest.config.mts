import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.test.tsx',
    ],
    exclude: ['node_modules', 'tests/e2e'],
    // Use node environment for unit/integration tests (no DOM needed for server actions)
    // Component tests can override with // @vitest-environment happy-dom
    environment: 'node',
    // Timeout for each test (ms) - prevents hanging tests
    testTimeout: 5000,
    // Hook timeout
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['lib/**/*.ts', 'components/**/*.tsx'],
      exclude: [
        'lib/**/*.d.ts',
        'types/**',
        'components/ui/**', // shadcn components
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
