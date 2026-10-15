module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Se mide TODO src/ (unitarias + e2e juntas), no solo los módulos con suite propia: el número
  // tiene que decir cuánto del sistema está probado de verdad. Quedan fuera los scripts operativos
  // (src/ops, que se ejecutan a mano), el arranque del proceso (server.ts) y los tipos.
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/ops/**',
    '!src/server.ts'
  ],
  coverageReporters: ['text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      // Un poco por debajo de lo medido el 15 de octubre de 2026 (77,8 / 64,9 / 69,4 / 79,8)
      // para que una variación mínima no rompa el CI. Solo se sube, nunca se baja.
      statements: 75,
      branches: 62,
      functions: 66,
      lines: 77
    }
  }
};
