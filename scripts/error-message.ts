function redactSensitiveValues(message: string): string {
  return message
    .replace(/(postgres(?:ql)?:\/\/)[^/\s@]+@/gi, '$1[redacted]@')
    .replace(/((?:password|token|secret|api[_-]?key)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]');
}

function stringProperty(value: object, key: string): string | null {
  if (!(key in value)) return null;
  const property: unknown = Reflect.get(value, key);
  return typeof property === 'string' && property.length > 0 ? property : null;
}

export function formatSafeError(error: unknown): string {
  if (typeof error === 'string') return redactSensitiveValues(error);
  if (error === null || typeof error !== 'object') {
    return `Non-Error rejection (${typeof error}).`;
  }

  const name = stringProperty(error, 'name');
  const code = stringProperty(error, 'code');
  const message = stringProperty(error, 'message');
  const details = [name, code ? `code ${code}` : null, message]
    .filter((part): part is string => part !== null);
  return details.length > 0
    ? redactSensitiveValues(details.join(': '))
    : `Non-Error rejection (${Object.prototype.toString.call(error)}).`;
}
