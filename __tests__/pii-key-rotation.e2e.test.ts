// Rotación de PII_ENCRYPTION_KEY contra Postgres real, en una base propia (la rotación recorre TODA
// la tabla de clientes y no debe tocar los datos de las demás suites e2e).
import crypto from "crypto";
import { Client } from "pg";
import { decryptPII, encryptPII } from "../src/lib/pii-encryption";
import { rotatePiiKey } from "../src/ops/rotate-pii-key";

const OLD = crypto.randomBytes(32).toString("hex");
const NEW = crypto.randomBytes(32).toString("hex");
const DB = "adetravel_rotation_test";
const base = (process.env.DATABASE_URL ?? "").replace(/[?&]schema=[^&]*/, "");
const adminUrl = base.replace(/\/[^/]+$/, "/postgres");
const dbUrl = base.replace(/\/[^/]+$/, `/${DB}`);

const PLAIN = { passportNumber: "P1112223", bankAccount: "000999888", bankAccountHolder: "Titular Rot" };

describe("rotación de PII_ENCRYPTION_KEY (integración con Postgres)", () => {
  let db: Client;

  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.query(`CREATE DATABASE ${DB}`);
    await admin.end();
    db = new Client({ connectionString: dbUrl });
    await db.connect();
    await db.query(`CREATE TABLE clients (id text PRIMARY KEY, "passportNumber" text, "bankAccount" text, "bankAccountHolder" text)`);
    await db.query(`CREATE TABLE system_config (id text PRIMARY KEY, "smtpPassword" text)`);
  });

  afterAll(async () => {
    await db.end();
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
    await admin.end();
  });

  beforeEach(async () => {
    await db.query("DELETE FROM clients");
    await db.query("DELETE FROM system_config");
    for (const id of ["c1", "c2"]) {
      await db.query(`INSERT INTO clients VALUES ($1, $2, $3, $4)`, [
        id,
        encryptPII(PLAIN.passportNumber, OLD),
        encryptPII(PLAIN.bankAccount, OLD),
        id === "c1" ? encryptPII(PLAIN.bankAccountHolder, OLD) : null,
      ]);
    }
    await db.query(`INSERT INTO clients VALUES ('c3', 'en-claro-antiguo', NULL, NULL)`);
    await db.query(`INSERT INTO system_config VALUES ('cfg', $1)`, [encryptPII("Smtp-Clave-1", OLD)]);
  });

  const all = async () => {
    const c = (await db.query(`SELECT * FROM clients ORDER BY id`)).rows;
    const s = (await db.query(`SELECT * FROM system_config`)).rows[0];
    return { c, s };
  };

  it("--dry-run cuenta pero no escribe", async () => {
    const before = await all();
    const r = await rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: NEW, dryRun: true });
    expect(r).toMatchObject({ toRotate: 6, alreadyNew: 0, plaintext: 1, rotated: 0, dryRun: true });
    expect(await all()).toEqual(before);
  });

  it("re-cifra todo con la clave nueva; la vieja deja de servir; el texto plano no se toca", async () => {
    const r = await rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: NEW });
    expect(r).toMatchObject({ toRotate: 6, rotated: 6, plaintext: 1 });
    const { c, s } = await all();
    expect(decryptPII(c[0].passportNumber, NEW)).toBe(PLAIN.passportNumber);
    expect(decryptPII(c[0].bankAccountHolder, NEW)).toBe(PLAIN.bankAccountHolder);
    expect(decryptPII(c[1].bankAccount, NEW)).toBe(PLAIN.bankAccount);
    expect(decryptPII(s.smtpPassword, NEW)).toBe("Smtp-Clave-1");
    expect(decryptPII(c[0].passportNumber, OLD)).toBe(c[0].passportNumber); // con la vieja ya no descifra
    expect(c[2].passportNumber).toBe("en-claro-antiguo");
  });

  it("es idempotente: una segunda ejecución no hace nada", async () => {
    await rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: NEW });
    const after = await all();
    const r = await rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: NEW });
    expect(r).toMatchObject({ toRotate: 0, alreadyNew: 6, rotated: 0 });
    expect(await all()).toEqual(after);
  });

  it("si algo no se descifra con ninguna de las dos claves, aborta sin tocar nada", async () => {
    await db.query(`UPDATE clients SET "bankAccount" = $1 WHERE id = 'c2'`, [encryptPII("otra", crypto.randomBytes(32).toString("hex"))]);
    const before = await all();
    await expect(rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: NEW })).rejects.toThrow(/no se toca nada/);
    expect(await all()).toEqual(before);
  });

  it("rechaza claves inválidas o iguales", async () => {
    await expect(rotatePiiKey({ databaseUrl: dbUrl, oldKey: OLD, newKey: OLD })).rejects.toThrow(/igual/);
    await expect(rotatePiiKey({ databaseUrl: dbUrl, oldKey: "corta", newKey: NEW })).rejects.toThrow(/hex de 64/);
  });
});
