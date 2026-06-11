import { describe, it, expect } from 'vitest';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';
import { InvalidSessionError } from '../../../../src/L1_domain/errors/invalid-session.error';

describe('BearerToken', () => {
  it('construye con un string no vacío y expone value', () => {
    const t = new BearerToken('6|abc123');
    expect(t.value).toBe('6|abc123');
  });

  it('trimea whitespace alrededor', () => {
    const t = new BearerToken('  6|xyz  ');
    expect(t.value).toBe('6|xyz');
  });

  it('rechaza string vacío con InvalidSessionError', () => {
    expect(() => new BearerToken('')).toThrow(InvalidSessionError);
  });

  it('rechaza solo whitespace con InvalidSessionError', () => {
    expect(() => new BearerToken('   ')).toThrow(InvalidSessionError);
  });

  it('rechaza null-equivalent sin crashear', () => {
    expect(() => new BearerToken(null as unknown as string)).toThrow(InvalidSessionError);
    expect(() => new BearerToken(undefined as unknown as string)).toThrow(InvalidSessionError);
  });

  it('toString() devuelve el value', () => {
    const t = new BearerToken('6|abc');
    expect(t.toString()).toBe('6|abc');
  });
});
