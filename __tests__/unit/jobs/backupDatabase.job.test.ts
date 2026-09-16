const mockExecFile = jest.fn((_cmd: string, _args: string[], cb: (err: Error | null, stdout?: string, stderr?: string) => void) => cb(null, "", ""));
jest.mock("child_process", () => ({ execFile: mockExecFile }));

const mockReadFile = jest.fn().mockResolvedValue(Buffer.from("fake-dump-content"));
const mockMkdtemp = jest.fn().mockResolvedValue("/tmp/adetravel-backup-fake");
const mockRm = jest.fn().mockResolvedValue(undefined);
jest.mock("fs/promises", () => ({
  readFile: mockReadFile,
  mkdtemp: mockMkdtemp,
  rm: mockRm
}));

const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ __type: "Put", input })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ __type: "List", input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ __type: "Delete", input }))
}));

interface MockEnv {
  DATABASE_URL: string;
  BACKUP_S3_ENDPOINT?: string;
  BACKUP_S3_BUCKET?: string;
  BACKUP_S3_REGION: string;
  BACKUP_S3_ACCESS_KEY_ID?: string;
  BACKUP_S3_SECRET_ACCESS_KEY?: string;
  BACKUP_CRON: string;
  BACKUP_RETENTION_DAYS: number;
}

const baseEnv: MockEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/adetravel",
  BACKUP_S3_ENDPOINT: "https://minio.example.com",
  BACKUP_S3_BUCKET: "adetravel-backups-test",
  BACKUP_S3_REGION: "us-east-1",
  BACKUP_S3_ACCESS_KEY_ID: "fake-access-key",
  BACKUP_S3_SECRET_ACCESS_KEY: "fake-secret-key",
  BACKUP_CRON: "0 3 * * *",
  BACKUP_RETENTION_DAYS: 30
};
let mockEnv: MockEnv = { ...baseEnv };
jest.mock("../../../src/config/env", () => ({
  get env() {
    return mockEnv;
  }
}));

import { runDatabaseBackupJob, backupsEnabled } from "../../../src/jobs/backupDatabase.job";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("backupDatabase.job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from("fake-dump-content"));
    mockMkdtemp.mockResolvedValue("/tmp/adetravel-backup-fake");
    mockEnv = { ...baseEnv };
    mockS3Send.mockImplementation((command: { __type: string }) => {
      if (command.__type === "List") return Promise.resolve({ Contents: [] });
      return Promise.resolve({});
    });
  });

  describe("backupsEnabled", () => {
    it("es true cuando están las 4 variables S3 requeridas", () => {
      expect(backupsEnabled()).toBe(true);
    });

    it.each(["BACKUP_S3_ENDPOINT", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"] as const)(
      "es false si falta %s",
      (key) => {
        mockEnv = { ...baseEnv, [key]: undefined };
        expect(backupsEnabled()).toBe(false);
      }
    );
  });

  describe("runDatabaseBackupJob", () => {
    it("lanza si los backups no están configurados", async () => {
      mockEnv = { ...baseEnv, BACKUP_S3_BUCKET: undefined };
      await expect(runDatabaseBackupJob()).rejects.toThrow(/no configurados/);
    });

    it("corre pg_dump con --format=custom y la connection string, sin interpolarla en un shell", async () => {
      await runDatabaseBackupJob();

      expect(mockExecFile).toHaveBeenCalledWith(
        "pg_dump",
        expect.arrayContaining(["--format=custom", baseEnv.DATABASE_URL]),
        expect.any(Function)
      );
    });

    it("saca el `?schema=` de DATABASE_URL (Prisma) y lo traduce a --schema (libpq no lo reconoce)", async () => {
      mockEnv = { ...baseEnv, DATABASE_URL: "postgresql://user:pass@localhost:5432/adetravel?schema=public" };

      await runDatabaseBackupJob();

      const [, args] = mockExecFile.mock.calls[0];
      expect(args).toEqual(
        expect.arrayContaining(["--schema=public", "postgresql://user:pass@localhost:5432/adetravel"])
      );
      expect(args.some((arg: string) => arg.includes("schema=public") && arg.startsWith("postgresql://"))).toBe(false);
    });

    it("sube el dump al bucket configurado con el prefijo esperado", async () => {
      const result = await runDatabaseBackupJob();

      const putCall = mockS3Send.mock.calls.find(([cmd]) => cmd.__type === "Put");
      expect(putCall).toBeDefined();
      const putInput = putCall![0].input;
      expect(putInput.Bucket).toBe("adetravel-backups-test");
      expect(putInput.Key).toMatch(/^adetravel-db\/.*\.dump$/);
      expect(result.key).toBe(putInput.Key);
      expect(result.sizeBytes).toBe(Buffer.from("fake-dump-content").byteLength);
    });

    it("limpia el directorio temporal incluso si falla la subida", async () => {
      mockS3Send.mockImplementation((command: { __type: string }) => {
        if (command.__type === "Put") return Promise.reject(new Error("s3 down"));
        return Promise.resolve({ Contents: [] });
      });

      await expect(runDatabaseBackupJob()).rejects.toThrow("s3 down");
      expect(mockRm).toHaveBeenCalledWith("/tmp/adetravel-backup-fake", { recursive: true, force: true });
    });

    it("elimina del bucket solo los backups más viejos que BACKUP_RETENTION_DAYS", async () => {
      const oldKey = "adetravel-db/old.dump";
      const recentKey = "adetravel-db/recent.dump";
      mockS3Send.mockImplementation((command: { __type: string }) => {
        if (command.__type === "List") {
          return Promise.resolve({
            Contents: [
              { Key: oldKey, LastModified: new Date(Date.now() - 40 * DAY_MS) },
              { Key: recentKey, LastModified: new Date(Date.now() - 5 * DAY_MS) }
            ]
          });
        }
        return Promise.resolve({});
      });

      const result = await runDatabaseBackupJob();

      expect(result.prunedKeys).toEqual([oldKey]);
      const deleteCalls = mockS3Send.mock.calls.filter(([cmd]) => cmd.__type === "Delete");
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][0].input).toEqual({ Bucket: "adetravel-backups-test", Key: oldKey });
    });

    it("pagina la lista de objetos antes de decidir qué podar", async () => {
      const oldFromPage1 = "adetravel-db/page1-old.dump";
      const oldFromPage2 = "adetravel-db/page2-old.dump";
      let listCalls = 0;
      mockS3Send.mockImplementation((command: { __type: string }) => {
        if (command.__type === "List") {
          listCalls += 1;
          if (listCalls === 1) {
            return Promise.resolve({
              Contents: [{ Key: oldFromPage1, LastModified: new Date(Date.now() - 40 * DAY_MS) }],
              NextContinuationToken: "page-2"
            });
          }
          return Promise.resolve({
            Contents: [{ Key: oldFromPage2, LastModified: new Date(Date.now() - 60 * DAY_MS) }]
          });
        }
        return Promise.resolve({});
      });

      const result = await runDatabaseBackupJob();

      expect(listCalls).toBe(2);
      expect(result.prunedKeys.sort()).toEqual([oldFromPage1, oldFromPage2].sort());
    });
  });
});
