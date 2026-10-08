import type { Breadcrumb, Event } from "@sentry/node";
import { maskText, pathWithoutQuery, scrub } from "./pii-scrub";

const SAFE_HEADERS = new Set(["user-agent", "content-type", "accept", "x-request-id"]);

/**
 * Quita de un evento de Sentry los datos personales: cuerpo, cookies y query de la petición,
 * cabeceras salvo las técnicas, y del usuario solo queda el id. Los mensajes, excepciones,
 * extras y contextos pasan por el mismo filtro que los logs.
 */
export function scrubSentryEvent<E extends Event>(event: E): E {
  if (event.request) {
    const { url, method, headers } = event.request;
    event.request = {
      ...(url ? { url: maskText(pathWithoutQuery(url)) } : {}),
      ...(method ? { method } : {}),
      ...(headers
        ? { headers: Object.fromEntries(Object.entries(headers).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase()))) }
        : {}),
    };
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = maskText(event.message);
  if (event.transaction) event.transaction = maskText(pathWithoutQuery(event.transaction));
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = maskText(ex.value);
    for (const frame of ex.stacktrace?.frames ?? []) {
      // Las variables locales de cada marco pueden contener cuerpos de petición completos.
      delete frame.vars;
    }
  }
  if (event.extra) event.extra = scrub(event.extra);
  if (event.contexts) event.contexts = scrub(event.contexts);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => scrubSentryBreadcrumb(b));
  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: maskText(breadcrumb.message) } : {}),
    ...(breadcrumb.data
      ? {
          data: scrub({
            ...breadcrumb.data,
            ...(typeof breadcrumb.data.url === "string" ? { url: pathWithoutQuery(breadcrumb.data.url) } : {}),
          }),
        }
      : {}),
  };
}
