import { systemConfigExtension } from "../../../src/lib/system-config-extension";

const { findFirst } = systemConfigExtension.query.systemConfig;

describe("systemConfigExtension.findFirst", () => {
  it("sin orderBy, ordena por la fila más antigua y desempata por id", async () => {
    const query = jest.fn().mockResolvedValue({ id: "a" });
    const args: Record<string, unknown> = { select: { agencyName: true } };

    await findFirst({ args, query });

    expect(query).toHaveBeenCalledWith({
      select: { agencyName: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  });

  it("respeta un orderBy explícito", async () => {
    const query = jest.fn().mockResolvedValue(null);
    const args = { orderBy: { updatedAt: "desc" } };

    await findFirst({ args, query });

    expect(query).toHaveBeenCalledWith({ orderBy: { updatedAt: "desc" } });
  });

  it("conserva el where (p. ej. releer por id)", async () => {
    const query = jest.fn().mockResolvedValue(null);

    await findFirst({ args: { where: { id: "x" } }, query });

    expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "x" } }));
  });
});
