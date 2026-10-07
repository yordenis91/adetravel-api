/**
 * Apoyo del ensayo de restauración (ver scripts/restore-drill.sh y OPERATIONS.md).
 *
 *   download <archivo>  Descarga el backup más reciente del bucket (BACKUP_S3_*) a <archivo>.
 *   verify              Comprueba la base restaurada (DATABASE_URL): migraciones, tablas y que
 *                       la PII cifrada se descifra con PII_ENCRYPTION_KEY. Nunca imprime datos.
 *
 * Usa `pg` directamente (no Prisma): la base restaurada puede ir una migración por detrás o por
 * delante del cliente generado en este repo.
 */
import { createWriteStream } from "fs";
import { readdir } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { GetObjectCommand, ListObjectsV2Command, S3Client, type _Object } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { decryptPII, isEncryptedPII } from "../src/lib/pii-encryption";

const OBJECT_PREFIX = "adetravel-db/";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

async function download(target: string): Promise<void> {
  const bucket = required("BACKUP_S3_BUCKET");
  const client = new S3Client({
    endpoint: required("BACKUP_S3_ENDPOINT"),
    region: process.env.BACKUP_S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: required("BACKUP_S3_ACCESS_KEY_ID"), secretAccessKey: required("BACKUP_S3_SECRET_ACCESS_KEY") },
  });

  const objects: _Object[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: OBJECT_PREFIX, ContinuationToken: token }));
    objects.push(...(page.Contents ?? []));
    token = page.NextContinuationToken;
  } while (token);

  const latest = objects
    .filter((o) => o.Key?.endsWith(".dump") && o.LastModified)
    .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime())[0];
  if (!latest) throw new Error(`No hay backups en ${bucket}/${OBJECT_PREFIX}`);

  const ageHours = (Date.now() - latest.LastModified!.getTime()) / 3_600_000;
  console.log(`Backups en el bucket: ${objects.length}`);
  console.log(`Más reciente: ${latest.Key} (${latest.Size} bytes, hace ${ageHours.toFixed(1)} h)`);
  if (ageHours > 26) console.log("AVISO: el último backup tiene más de 26 h; el cron diario puede estar fallando.");

  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latest.Key! }));
  await pipeline(res.Body as Readable, createWriteStream(target));
}

async function verify(): Promise<void> {
  required("PII_ENCRYPTION_KEY");
  const db = new Client({ connectionString: required("DATABASE_URL").replace(/[?&]schema=[^&]*/, "") });
  await db.connect();
  const problems: string[] = [];
  try {
    const local = (await readdir(path.join(__dirname, "../prisma/migrations"), { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const applied = (await db.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows.map(
      (r) => r.migration_name as string
    );
    const failed = (await db.query(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`)).rows[0].n;
    const missing = local.filter((m) => !applied.includes(m));
    const unknown = applied.filter((m) => !local.includes(m));
    console.log(`Migraciones: ${applied.length} aplicadas en el backup, ${local.length} en este repo.`);
    if (missing.length) console.log(`  Pendientes respecto al repo (se aplicarían al arrancar): ${missing.join(", ")}`);
    if (unknown.length) console.log(`  En el backup pero no en este repo: ${unknown.join(", ")}`);
    if (failed) problems.push(`${failed} migración(es) a medias (P3009) en el backup`);

    const tables = ["users", "clients", "providers", "requests", "services", "quotations", "confirmations", "payments", "vouchers", "activity_logs", "notifications", "tasks"];
    console.log("Filas por tabla:");
    for (const t of tables) {
      const exists = (await db.query(`SELECT to_regclass($1) AS r`, [`public.${t}`])).rows[0].r;
      if (!exists) {
        console.log(`  ${t}: (no existe)`);
        continue;
      }
      const n = (await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;
      console.log(`  ${t}: ${n}`);
    }
    const users = (await db.query(`SELECT count(*)::int AS n FROM users WHERE role = 'ADMINISTRADOR' AND "isActive"`)).rows[0].n;
    if (users === 0) problems.push("no hay ningún administrador activo en el backup");

    const fields = ["passportNumber", "bankAccount", "bankAccountHolder"];
    const rows = (await db.query(`SELECT ${fields.map((f) => `"${f}"`).join(", ")} FROM clients`)).rows;
    let encrypted = 0;
    let decrypted = 0;
    let plain = 0;
    for (const row of rows) {
      for (const f of fields) {
        const v = row[f] as string | null;
        if (!v) continue;
        if (!isEncryptedPII(v)) {
          plain++;
          continue;
        }
        encrypted++;
        // decryptPII devuelve el valor cifrado tal cual si la clave no corresponde.
        const out = decryptPII(v);
        if (out !== null && out !== v && !isEncryptedPII(out)) decrypted++;
      }
    }
    console.log(`PII de clientes: ${encrypted} campos cifrados, ${decrypted} descifrados con la clave, ${plain} en texto plano.`);
    if (encrypted !== decrypted) problems.push(`${encrypted - decrypted} campo(s) de PII no se descifran con esta PII_ENCRYPTION_KEY`);
    if (plain) console.log("  AVISO: hay PII en texto plano; correr npm run pii:encrypt-backfill en producción.");

    const smtp = (await db.query(`SELECT "smtpPassword" FROM system_config WHERE "smtpPassword" IS NOT NULL`).catch(() => ({ rows: [] }))).rows;
    for (const r of smtp) {
      if (!isEncryptedPII(r.smtpPassword)) console.log("Contraseña SMTP: en texto plano (correr npm run smtp:encrypt-password).");
      else if (decryptPII(r.smtpPassword) === r.smtpPassword) problems.push("la contraseña SMTP no se descifra con esta clave");
      else console.log("Contraseña SMTP: cifrada y se descifra con la clave.");
    }
  } finally {
    await db.end();
  }

  if (problems.length) {
    console.log(`\nRESULTADO: FALLA\n - ${problems.join("\n - ")}`);
    process.exit(1);
  }
  console.log("\nRESULTADO: OK. El backup restaura y la clave descifra la PII.");
}

const [command, arg] = process.argv.slice(2);
(command === "download" && arg ? download(arg) : command === "verify" ? verify() : Promise.reject(new Error("Uso: restore-drill.ts download <archivo> | verify")))
  .catch((e) => {
    console.error(`ERROR: ${e.message}`);
    process.exit(1);
  });
