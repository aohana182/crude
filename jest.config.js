module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        strict: true,
        baseUrl: '.',
        paths: { '@/*': ['./*'] },
      },
    },
  },
};
