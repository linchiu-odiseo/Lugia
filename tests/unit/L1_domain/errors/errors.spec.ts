import { describe, it, expect } from 'vitest';
import { InvalidCredentialsError } from '../../../../src/L1_domain/errors/invalid-credentials.error';
import { InvalidSessionError } from '../../../../src/L1_domain/errors/invalid-session.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';

describe('Errores de dominio', () => {
  describe('InvalidCredentialsError', () => {
    it('es instanceof Error', () => {
      expect(new InvalidCredentialsError()).toBeInstanceOf(Error);
    });

    it('es instanceof InvalidCredentialsError', () => {
      expect(new InvalidCredentialsError()).toBeInstanceOf(InvalidCredentialsError);
    });

    it('tiene name correcto', () => {
      expect(new InvalidCredentialsError().name).toBe('InvalidCredentialsError');
    });

    it('expone message por defecto en español', () => {
      expect(new InvalidCredentialsError().message).toBe('Credenciales inválidas.');
    });

    it('acepta message custom', () => {
      expect(new InvalidCredentialsError('foo').message).toBe('foo');
    });
  });

  describe('NetworkError', () => {
    it('es instanceof Error y NetworkError', () => {
      const err = new NetworkError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(NetworkError);
    });

    it('tiene name correcto', () => {
      expect(new NetworkError().name).toBe('NetworkError');
    });

    it('expone message por defecto en español', () => {
      expect(new NetworkError().message).toBe('No se pudo conectar al servidor. Inténtalo de nuevo.');
    });
  });

  describe('InvalidSessionError', () => {
    it('es instanceof Error y InvalidSessionError', () => {
      const err = new InvalidSessionError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvalidSessionError);
    });

    it('tiene name correcto', () => {
      expect(new InvalidSessionError().name).toBe('InvalidSessionError');
    });
  });

  describe('discriminación entre errores', () => {
    it('un InvalidCredentialsError NO es instanceof NetworkError ni InvalidSessionError', () => {
      const err = new InvalidCredentialsError();
      expect(err).not.toBeInstanceOf(NetworkError);
      expect(err).not.toBeInstanceOf(InvalidSessionError);
    });
  });
});
