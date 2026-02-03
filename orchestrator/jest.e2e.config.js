/** @type {import('jest').Config} */
// eslint-disable-next-line no-undef
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'e2e',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
  testTimeout: 300000,
  maxWorkers: 1,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
