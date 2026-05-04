/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js'],
    collectCoverageFrom: ['src/**/*.ts', '!src/extension.ts'],
    coverageDirectory: 'coverage',
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    },
};
