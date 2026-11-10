const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;
const MAX_JITTER = 0.2;




export const backoffMs = (attempts: number) =>
  Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS) * (1 + Math.random() * MAX_JITTER);
