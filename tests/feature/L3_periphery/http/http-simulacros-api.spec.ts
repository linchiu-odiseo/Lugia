import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { HttpSimulacrosApi } from '../../../../src/L3_periphery/http/http-simulacros-api';
import { Simulacro } from '../../../../src/L1_domain/entities/simulacro';
import { ServerTime } from '../../../../src/L1_domain/value-objects/server-time';
import { InvalidSimulacroError } from '../../../../src/L1_domain/errors/invalid-simulacro.error';
import { NetworkError } from '../../../../src/L1_domain/errors/network.error';
import { SessionExpiredError } from '../../../../src/L1_domain/errors/session-expired.error';
import { environment } from '../../../../src/environments/environment';

describe('HttpSimulacrosApi', () => {
  let httpMock: HttpTestingController;
  let adapter: HttpSimulacrosApi;

  const SIMULACROS_URL = `${environment.apiBaseUrl}/simulacros`;

  // DTO base válido para componer respuestas.
  const dtoFor = (overrides: Partial<{
    id: string;
    area: string;
    name: string;
    count: number;
    inicio: string;
    fin: string;
    estado: string;
  }> = {}) => ({
    id: 'sim-1',
    area: 'Matemática',
    name: 'Simulacro 1',
    count: 20,
    inicio: '2026-06-11T10:00:00Z',
    fin: '2026-06-11T12:00:00Z',
    estado: 'abierto',
    ...overrides,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), HttpSimulacrosApi],
    });
    httpMock = TestBed.inject(HttpTestingController);
    adapter = TestBed.inject(HttpSimulacrosApi);
  });

  afterEach(() => httpMock.verify());

  describe('obtenerDelDia — happy path', () => {
    it('hace GET a /simulacros y mapea simulacros + serverTime correctamente', async () => {
      const pending = adapter.obtenerDelDia();

      const req = httpMock.expectOne(SIMULACROS_URL);
      expect(req.request.method).toBe('GET');

      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        simulacros: [
          dtoFor({ id: 'sim-1', estado: 'abierto' }),
          dtoFor({ id: 'sim-2', estado: 'pendiente', area: 'Comunicación' }),
        ],
      });

      const result = await pending;

      expect(result.serverTime).toBeInstanceOf(ServerTime);
      expect(result.serverTime.toMillis()).toBe(
        new Date('2026-06-11T11:30:00Z').getTime(),
      );

      expect(result.simulacros).toHaveLength(2);
      expect(result.simulacros[0]).toBeInstanceOf(Simulacro);
      expect(result.simulacros[0].id).toBe('sim-1');
      expect(result.simulacros[0].estado.value).toBe('abierto');
      expect(result.simulacros[0].inicio).toEqual(new Date('2026-06-11T10:00:00Z'));
      expect(result.simulacros[0].fin).toEqual(new Date('2026-06-11T12:00:00Z'));
      expect(result.simulacros[1].id).toBe('sim-2');
      expect(result.simulacros[1].area).toBe('Comunicación');
      expect(result.simulacros[1].estado.value).toBe('pendiente');
    });

    it('lista vacía: result.simulacros es array vacío y serverTime sigue presente', async () => {
      const pending = adapter.obtenerDelDia();

      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush({
        serverTime: '2026-06-11T08:00:00Z',
        simulacros: [],
      });

      const result = await pending;

      expect(result.simulacros).toEqual([]);
      expect(result.serverTime).toBeInstanceOf(ServerTime);
      expect(result.serverTime.toMillis()).toBe(
        new Date('2026-06-11T08:00:00Z').getTime(),
      );
    });

    it.each(['pendiente', 'abierto', 'enviado', 'cerrado'] as const)(
      'mapea correctamente el estado "%s" del DTO a EstadoSimulacro',
      async (estado) => {
        const pending = adapter.obtenerDelDia();
        const req = httpMock.expectOne(SIMULACROS_URL);
        req.flush({
          serverTime: '2026-06-11T11:30:00Z',
          simulacros: [dtoFor({ estado })],
        });

        const result = await pending;
        expect(result.simulacros[0].estado.value).toBe(estado);
      },
    );
  });

  describe('obtenerDelDia — rechazos por DTO inválido', () => {
    it('estado inválido en el DTO propaga InvalidSimulacroError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        simulacros: [dtoFor({ estado: 'atrasable' })],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidSimulacroError);
    });

    it('inicio no-ISO8601 propaga InvalidSimulacroError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        simulacros: [dtoFor({ inicio: 'no-es-fecha' })],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidSimulacroError);
    });

    it('fin no-ISO8601 propaga InvalidSimulacroError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush({
        serverTime: '2026-06-11T11:30:00Z',
        simulacros: [dtoFor({ fin: 'tampoco-es-fecha' })],
      });

      await expect(pending).rejects.toBeInstanceOf(InvalidSimulacroError);
    });
  });

  describe('obtenerDelDia — mapeo HTTP → errores de dominio', () => {
    it('401 → SessionExpiredError (cuerpo ignorado)', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush(
        { message: 'cualquier-string-que-cambie' },
        { status: 401, statusText: 'Unauthorized' },
      );
      await expect(pending).rejects.toBeInstanceOf(SessionExpiredError);
    });

    it('500 → NetworkError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('503 → NetworkError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush('unavailable', { status: 503, statusText: 'Service Unavailable' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    it('fallo de transporte (status 0) → NetworkError', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network failure' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });

    // El adapter actual clasifica TODO 4xx no-401 como NetworkError (fallback
    // en classifyGetError). Documentamos el comportamiento real para que
    // cualquier cambio futuro lo dispute explícitamente.
    it('400 genérico → NetworkError (comportamiento del fallback del adapter)', async () => {
      const pending = adapter.obtenerDelDia();
      const req = httpMock.expectOne(SIMULACROS_URL);
      req.flush({ message: 'bad request' }, { status: 400, statusText: 'Bad Request' });
      await expect(pending).rejects.toBeInstanceOf(NetworkError);
    });
  });

  // Los tests de `enviar()` viven en su propio archivo
  // `http-simulacros-api-enviar.spec.ts` (sec.9). Acá solo cubrimos GET /simulacros.
});
