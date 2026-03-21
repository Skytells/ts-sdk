module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/', '<rootDir>/tests/'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  /** Live API tests use real fetch; run via `test:integration` / `test:sdk-live` / `test:chat-live` only. */
  testPathIgnorePatterns: ['/node_modules/', 'inference\\.integration\\.test\\.ts', 'sdk\\.live\\.test\\.ts', 'chat-responses\\.live\\.test\\.ts', 'prediction\\.live\\.test\\.ts', 'orchestrator\\.live\\.test\\.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: { ignoreDiagnostics: [6133] } }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}; 