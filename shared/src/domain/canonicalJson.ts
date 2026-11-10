type CanonicalValue = string | number | boolean | null | CanonicalValue[] | { [key: string]: CanonicalValue };



export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const members = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(',')}}`;
  }
  throw new Error('Unsupported value in signed data');
}



export function signingInput(prefix: string, payload: object): string {
  return `${prefix}\n${canonicalJson(payload)}`;
}


function isPlainObject(value: unknown): value is Record<string, CanonicalValue> {
  return typeof value === 'object' && value !== null;
}