import { AsyncLocalStorage } from "node:async_hooks";

/** Contexto de la petición en curso: permite que cualquier log lleve su requestId. */
export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
