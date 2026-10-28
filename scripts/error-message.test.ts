import { describe, expect, it } from 'vitest';
import { formatSafeError } from './error-message';

describe('formatSafeError', () => {
  it('formats Prisma-style errors without requiring an Error instance', () => {
    expect(formatSafeError({
      name: 'PrismaClientKnownRequestError',
      code: 'P2021',
      message: 'The table does not exist.',
    })).toBe('PrismaClientKnownRequestError: code P2021: The table does not exist.');
  });

  it('redacts credentials from connection URLs and secret assignments', () => {
    const message = 'Connect failed for postgresql://user:pass@db.example/app?password=hidden token=private';
    const formatted = formatSafeError(message);
    expect(formatted).not.toContain('user:pass');
    expect(formatted).not.toContain('hidden');
    expect(formatted).not.toContain('private');
    expect(formatted).toContain('postgresql://[redacted]@db.example/app');
  });
});
