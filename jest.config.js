module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // La cobertura se mide solo sobre los módulos con tests unitarios reales
  // (pagos, PII de clientes, validadores/schemas compartidos, manejo de
  // errores). El resto del backend aún no tiene suite y diluiría el número
  // sin decir nada útil; se irá ampliando módulo por módulo.
  collectCoverageFrom: [
    'src/controllers/payments.controller.ts',
    'src/controllers/clients.controller.ts',
    'src/validators/payments.validator.ts',
    'src/validators/clients.validator.ts',
    'src/validators/users.validator.ts',
    'src/validators/catalog.validator.ts',
    'src/schemas/auth.schemas.ts',
    'src/utils/response.ts',
    'src/utils/api-error.ts',
    'src/middlewares/validation.middleware.ts',
    'src/middlewares/error-handler.middleware.ts',
    'src/lib/pii-encryption.ts',
    'src/lib/client-pii-extension.ts',
    'src/jobs/backupDatabase.job.ts'
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80
    }
  }
};
