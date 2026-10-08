import { sanitizeLegalHtml } from "../../../src/utils/sanitize-legal-html";

describe("sanitizeLegalHtml", () => {
  it("conserva el formato permitido", () => {
    expect(sanitizeLegalHtml("<h2>1. Uso</h2><p>Texto <strong>importante</strong></p><ul><li>a</li></ul>"))
      .toBe("<h2>1. Uso</h2><p>Texto <strong>importante</strong></p><ul><li>a</li></ul>");
  });

  it("elimina scripts, handlers y javascript: URLs", () => {
    const out = sanitizeLegalHtml(
      `<p onclick="x()">Hola</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">l</a>`
    )!;
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(out).toContain("Hola");
  });

  it("abre los enlaces externos de forma segura", () => {
    expect(sanitizeLegalHtml(`<a href="https://example.com">x</a>`))
      .toBe(`<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>`);
  });

  it("devuelve null si no hay texto visible o no es string", () => {
    expect(sanitizeLegalHtml("")).toBeNull();
    expect(sanitizeLegalHtml("<p></p><p><br></p>")).toBeNull();
    expect(sanitizeLegalHtml(null)).toBeNull();
    expect(sanitizeLegalHtml(42)).toBeNull();
  });
});
