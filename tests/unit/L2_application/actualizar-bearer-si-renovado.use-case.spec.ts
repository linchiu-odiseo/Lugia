import { describe, it, expect, beforeEach } from 'vitest';
import { ActualizarBearerSiRenovadoUseCase } from '../../../src/L2_application/use-cases/actualizar-bearer-si-renovado.use-case';
import { Session } from '../../../src/L1_domain/entities/session';
import { BearerToken } from '../../../src/L1_domain/value-objects/bearer-token';
import { InMemorySessionStorage } from './fakes';

describe('ActualizarBearerSiRenovadoUseCase', () => {
  let storage: InMemorySessionStorage;
  let useCase: ActualizarBearerSiRenovadoUseCase;

  const issuedAt = new Date('2026-06-11T12:00:00Z');
  const sessionWith = (token: string, email = 'fulano@panda.test', when: Date = issuedAt) =>
    new Session(new BearerToken(token), email, when);

  beforeEach(() => {
    storage = new InMemorySessionStorage();
    useCase = new ActualizarBearerSiRenovadoUseCase(storage);
  });

  it('reescribe la sesión con el nuevo bearer cuando llega un valor válido', async () => {
    await storage.write(sessionWith('6|old'));

    await useCase.execute('7|new');

    const persisted = await storage.read();
    expect(persisted).not.toBeNull();
    expect(persisted!.bearerToken.value).toBe('7|new');
  });

  it('preserva userEmail e issuedAt al rotar el bearer', async () => {
    await storage.write(sessionWith('6|old', 'fulano@panda.test', issuedAt));

    await useCase.execute('7|new');

    const persisted = await storage.read();
    expect(persisted!.userEmail).toBe('fulano@panda.test');
    expect(persisted!.issuedAt.getTime()).toBe(issuedAt.getTime());
  });

  it('bearer vacío es no-op (header malformado del backend)', async () => {
    const original = sessionWith('6|old');
    await storage.write(original);

    await useCase.execute('');

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('6|old');
  });

  it('bearer null es no-op', async () => {
    const original = sessionWith('6|old');
    await storage.write(original);

    await useCase.execute(null);

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('6|old');
  });

  it('bearer undefined es no-op', async () => {
    const original = sessionWith('6|old');
    await storage.write(original);

    await useCase.execute(undefined);

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('6|old');
  });

  it('bearer solo whitespace es no-op (trim resulta en empty)', async () => {
    const original = sessionWith('6|old');
    await storage.write(original);

    await useCase.execute('   \t\n  ');

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('6|old');
  });

  it('sin sesión activa + bearer válido es no-op (race condition con logout)', async () => {
    // No hay sesión persistida. Esto modela el caso raro donde una respuesta
    // in-flight trae X-New-Bearer pero el alumno ya hizo logout.
    expect(await storage.read()).toBeNull();

    await useCase.execute('7|new');

    expect(await storage.read()).toBeNull();
  });

  it('bearer con whitespace alrededor se persiste trimmeado', async () => {
    // El BearerToken value-object trimea en su constructor. Verificamos que
    // el use case y el VO conspiran para no persistir bytes extra del header.
    await storage.write(sessionWith('6|old'));

    await useCase.execute('  7|new  ');

    const persisted = await storage.read();
    expect(persisted!.bearerToken.value).toBe('7|new');
  });

  // NOTE: el único invariante que puede invalidar un BearerToken hoy es
  // `trimmed.length === 0` (ver value-objects/bearer-token.ts). Ese caso ya
  // queda cubierto por los tests de bearer vacío/null/undefined/whitespace
  // arriba — el use case lo intercepta antes de tocar el VO. No hay otra
  // forma de hacer fallar la construcción de BearerToken en el estado actual
  // del dominio, así que no agregamos un test de invariante violado.
});
