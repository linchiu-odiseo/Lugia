import { describe, it, expect, beforeEach } from 'vitest';
import { GetActiveSessionUseCase } from '../../../src/L2_application/use-cases/get-active-session.use-case';
import { Session } from '../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../src/L1_domain/value-objects/bearer-token';
import { InMemorySessionStorage } from './fakes';

describe('GetActiveSessionUseCase', () => {
  let storage: InMemorySessionStorage;
  let useCase: GetActiveSessionUseCase;

  beforeEach(() => {
    storage = new InMemorySessionStorage();
    useCase = new GetActiveSessionUseCase(storage);
  });

  it('devuelve la Session si hay una persistida', async () => {
    const session = new Session(
      new BearerToken('6|abc'),
      'fulano@panda.test',
      new Date('2026-06-11T12:00:00Z'),
    );
    await storage.write(session);
    expect(await useCase.execute()).toBe(session);
  });

  it('devuelve null si no hay sesión persistida', async () => {
    expect(await useCase.execute()).toBeNull();
  });

  it('devuelve null tras un clear', async () => {
    const session = new Session(
      new BearerToken('6|abc'),
      'fulano@panda.test',
      new Date('2026-06-11T12:00:00Z'),
    );
    await storage.write(session);
    await storage.clear();
    expect(await useCase.execute()).toBeNull();
  });
});
