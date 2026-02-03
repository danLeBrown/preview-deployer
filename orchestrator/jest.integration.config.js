/** @type {import('jest').Config} */
// eslint-disable-next-line no-undef
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'integration',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
