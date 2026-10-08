import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td",
];

/**
 * Los términos y la política se muestran en páginas públicas, así que el HTML que guarda la agencia
 * se limpia en el servidor (el cliente no es de fiar). Devuelve null si no queda texto visible.
 */
export function sanitizeLegalHtml(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }, true),
    },
  }).trim();
  const visibleText = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim();
  return visibleText ? clean : null;
}
