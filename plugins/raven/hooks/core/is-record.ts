/** Narrows untrusted data (store values, JSON, tool results) to an object whose fields can be read. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
