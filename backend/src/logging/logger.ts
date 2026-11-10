import { AsyncLocalStorage } from 'node:async_hooks';




interface RequestContext {
  requestId: string;
}

const context = new AsyncLocalStorage<RequestContext>();


export function runWithRequestId<T>(requestId: string, work: () => T): T {
  return context.run({ requestId }, work);
}


export function currentRequestId(): string | null {
  return context.getStore()?.requestId ?? null;
}


// One JSON object per line, tagged with the request it belongs to, so a single
// payment can be followed through the logs. Callers pass identifiers and
// outcomes only: never keys, tokens, request bodies or what a person said.
export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ event, requestId: currentRequestId(), ...fields }));
}
