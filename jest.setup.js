const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Los tests unitarios (mocks de Prisma, sin DB real) no necesitan una base de
// datos de verdad, pero src/config/env.ts exige DATABASE_URL/JWT_SECRET al
// importarse. Si no vino un .env.test real (con una DB de verdad para el test
// e2e), completamos con valores dummy para que la validación de env no falle.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/adetravel_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-not-for-real-use-000000';
// Clave AES-256 de prueba (32 bytes en hex) para src/lib/pii-encryption.ts.
process.env.PII_ENCRYPTION_KEY ??= '906c639158e63ca80722b307f1dbc02fbdc99ea980effb69ed585d16e82018cd';

