import { describe, it, expect } from 'vitest';
import { Session } from '../../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../../src/L1_domain/value-objects/bearer-token';
import { InvalidSessionError } from '../../../../src/L1_domain/errors/invalid-session.error';

describe('Session', () => {
  const validToken = new BearerToken('6|abc');
  const validEmail = 'fulano@panda.test';
  const validDate = new Date('2026-06-11T12:00:00Z');

  describe('construcción', () => {
    it('construye con args válidos', () => {
      const s = new Session(validToken, validEmail, validDate);
      expect(s.bearerToken).toBe(validToken);
      expect(s.userEmail).toBe(validEmail);
      expect(s.issuedAt).toEqual(validDate);
    });

    it('trimea userEmail', () => {
      const s = new Session(validToken, '  fulano@panda.test  ', validDate);
      expect(s.userEmail).toBe('fulano@panda.test');
    });

    it('rechaza bearerToken no-BearerToken', () => {
      expect(() => new Session(null as unknown as BearerToken, validEmail, validDate)).toThrow(
        InvalidSessionError,
      );
      expect(
        () => new Session('raw-string' as unknown as BearerToken, validEmail, validDate),
      ).toThrow(InvalidSessionError);
    });

    it('rechaza email sin @ con InvalidSessionError', () => {
      expect(() => new Session(validToken, 'no-arroba', validDate)).toThrow(InvalidSessionError);
    });

    it('rechaza email vacío con InvalidSessionError', () => {
      expect(() => new Session(validToken, '', validDate)).toThrow(InvalidSessionError);
      expect(() => new Session(validToken, '   ', validDate)).toThrow(InvalidSessionError);
    });

    it('rechaza issuedAt no-Date con InvalidSessionError', () => {
      expect(() => new Session(validToken, validEmail, 'today' as unknown as Date)).toThrow(
        InvalidSessionError,
      );
      expect(() => new Session(validToken, validEmail, new Date('invalid'))).toThrow(
        InvalidSessionError,
      );
    });
  });

  describe('isExpired', () => {
    it('devuelve false para sesión recién creada (issuedAt == now)', () => {
      const now = new Date();
      const s = new Session(validToken, validEmail, now);
      expect(s.isExpired(now)).toBe(false);
    });

    it('devuelve false aunque now sea muy posterior (Fase 1: tokens longevos)', () => {
      const issued = new Date('2020-01-01T00:00:00Z');
      const futureNow = new Date('2030-01-01T00:00:00Z');
      const s = new Session(validToken, validEmail, issued);
      expect(s.isExpired(futureNow)).toBe(false);
    });
  });

  describe('principal', () => {
    it('devuelve el userEmail', () => {
      const s = new Session(validToken, validEmail, validDate);
      expect(s.principal()).toBe(validEmail);
    });
  });
});
