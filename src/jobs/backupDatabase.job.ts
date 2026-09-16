import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  type _Object
} from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const execFileAsync = promisify(execFile);

const OBJECT_PREFIX = "adetravel-db/";

/**
 * IMPORTANTE: este backup cubre la base de datos, pero NO alcanza para
 * recuperar el pasaporte/cuenta bancaria de Cliente si se pierde
 * PII_ENCRYPTION_KEY — esos campos quedan cifrados con esa clave (ver
 * src/lib/pii-encryption.ts) y un dump solo contiene el texto cifrado.
 * La clave se respalda aparte, fuera de este bucket. Ver OPERATIONS.md.
 */
export interface BackupResult {
  key: string;
  sizeBytes: number;
  prunedKeys: string[];
}

function s3ConfigFromEnv() {
  const { BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY } = env;
  if (!BACKUP_S3_ENDPOINT || !BACKUP_S3_BUCKET || !BACKUP_S3_ACCESS_KEY_ID || !BACKUP_S3_SECRET_ACCESS_KEY) {
    return null;
  }
  return {
    bucket: BACKUP_S3_BUCKET,
    client: new S3Client({
      endpoint: BACKUP_S3_ENDPOINT,
      region: BACKUP_S3_REGION,
      // MinIO (y la mayoría de los S3-compatibles que no son AWS) necesitan
      // path-style ("endpoint/bucket/key") en vez del virtual-hosted-style
      // que usa el SDK por defecto ("bucket.endpoint/key").
      forcePathStyle: true,
      credentials: {
        accessKeyId: BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: BACKUP_S3_SECRET_ACCESS_KEY
      }
    })
  };
}

/** Config de S3 presente = backups habilitados. Usado por jobs/index.ts para decidir si registra el cron. */
export function backupsEnabled(): boolean {
  return s3ConfigFromEnv() !== null;
}

/**
 * Prisma acepta `?schema=<nombre>` en DATABASE_URL para elegir el schema de
 * Postgres, pero es una extensión propia de Prisma — libpq (y por lo tanto
 * `pg_dump`) no la reconoce y falla con "invalid URI query parameter" si se
 * la pasamos tal cual. Se saca ese parámetro de la URL y se traduce al
 * `--schema` nativo de pg_dump.
 */
function toPgDumpArgs(databaseUrl: string): string[] {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema");
  url.searchParams.delete("schema");

  const args = ["--format=custom"];
  if (schema) args.push(`--schema=${schema}`);
  args.push(url.toString());
  return args;
}

async function dumpDatabase(): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "adetravel-backup-"));
  const filePath = path.join(dir, `${randomUUID()}.dump`);

  // --format=custom: comprimido y restaurable con pg_restore (a diferencia
  // del SQL plano de --format=plain). Se pasa la connection string como
  // argumento posicional, nunca interpolada en un shell, para no arriesgar
  // inyección ni loguearla por accidente en un comando compuesto.
  await execFileAsync("pg_dump", [...toPgDumpArgs(env.DATABASE_URL), `--file=${filePath}`]);

  return {
    filePath,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

function isOlderThanRetention(lastModified: Date | undefined, retentionDays: number): boolean {
  if (!lastModified) return false;
  const ageMs = Date.now() - lastModified.getTime();
  return ageMs > retentionDays * 24 * 60 * 60 * 1000;
}

async function pruneOldBackups(client: S3Client, bucket: string, retentionDays: number): Promise<string[]> {
  const objects: _Object[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: OBJECT_PREFIX, ContinuationToken: continuationToken })
    );
    objects.push(...(page.Contents ?? []));
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  const toDelete = objects.filter((obj) => obj.Key && isOlderThanRetention(obj.LastModified, retentionDays));

  for (const obj of toDelete) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key! }));
  }

  return toDelete.map((obj) => obj.Key!);
}

/**
 * Corre `pg_dump`, sube el resultado al bucket S3-compatible configurado
 * (BACKUP_S3_*) y elimina del bucket los backups más viejos que
 * BACKUP_RETENTION_DAYS. No hace nada (ni lanza error) si los backups no
 * están configurados — ver backupsEnabled().
 */
export async function runDatabaseBackupJob(): Promise<BackupResult> {
  const s3 = s3ConfigFromEnv();
  if (!s3) {
    throw new Error("Backups no configurados: faltan variables BACKUP_S3_*");
  }

  const { filePath, cleanup } = await dumpDatabase();
  try {
    const body = await readFile(filePath);
    const key = `${OBJECT_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;

    await s3.client.send(
      new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: body, ContentType: "application/octet-stream" })
    );

    const prunedKeys = await pruneOldBackups(s3.client, s3.bucket, env.BACKUP_RETENTION_DAYS);

    return { key, sizeBytes: body.byteLength, prunedKeys };
  } finally {
    await cleanup();
  }
}
