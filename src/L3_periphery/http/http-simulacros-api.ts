import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  EnvioRequest,
  EnvioResult,
  SimulacrosApi,
  SimulacrosListResult,
} from '../../L1_domain/ports/simulacros-api';
import { Simulacro } from '../../L1_domain/entities/simulacro';
import { EstadoSimulacro } from '../../L1_domain/value-objects/estado-simulacro';
import { ServerTime } from '../../L1_domain/value-objects/server-time';
import { InvalidSimulacroError } from '../../L1_domain/errors/invalid-simulacro.error';
import { NetworkError } from '../../L1_domain/errors/network.error';
import { SessionExpiredError } from '../../L1_domain/errors/session-expired.error';
import { InvalidSubmissionTimeError } from '../../L1_domain/errors/invalid-submission-time.error';
import { InvalidPayloadError } from '../../L1_domain/errors/invalid-payload.error';
import { SimulacroCerradoError } from '../../L1_domain/errors/simulacro-cerrado.error';
import { SimulacroNoAsignadoError } from '../../L1_domain/errors/simulacro-no-asignado.error';
import { environment } from '../../environments/environment';

interface SimulacroDto {
  id: string;
  area: string;
  name: string;
  count: number;
  inicio: string;
  fin: string;
  estado: string;
}

interface SimulacrosListResponseDto {
  serverTime: string;
  simulacros: SimulacroDto[];
}

interface EnvioOkDto {
  status: 'enviado';
  clientSubmittedAt: string;
  serverReceivedAt: string;
}

interface EnvioErrorDto {
  message?: string;
  code?: 'INVALID_TIME' | 'INVALID_SHAPE' | 'CLOSED';
}

@Injectable({ providedIn: 'root' })
export class HttpSimulacrosApi implements SimulacrosApi {
  private readonly http = inject(HttpClient);

  async obtenerDelDia(): Promise<SimulacrosListResult> {
    try {
      const dto = await firstValueFrom(
        this.http.get<SimulacrosListResponseDto>(`${environment.apiBaseUrl}/simulacros`),
      );
      return {
        simulacros: dto.simulacros.map((s) => this.toSimulacro(s)),
        serverTime: new ServerTime(dto.serverTime),
      };
    } catch (err) {
      throw this.classifyGetError(err);
    }
  }

  async enviar(req: EnvioRequest): Promise<EnvioResult> {
    try {
      const dto = await firstValueFrom(
        this.http.post<EnvioOkDto>(
          `${environment.apiBaseUrl}/simulacros/${encodeURIComponent(req.simulacroId)}/envio`,
          { answers: req.answers, clientSubmittedAt: req.clientSubmittedAt },
        ),
      );
      return {
        status: 'enviado',
        clientSubmittedAt: dto.clientSubmittedAt,
        serverReceivedAt: dto.serverReceivedAt,
      };
    } catch (err) {
      const classified = this.classifyEnvioError(err, req);
      // 409 (idempotencia) llega como marker interno que colapsamos a éxito.
      if (classified instanceof IdempotentEnvioMarker) {
        return classified.result;
      }
      throw classified;
    }
  }

  private toSimulacro(dto: SimulacroDto): Simulacro {
    const inicio = new Date(dto.inicio);
    if (Number.isNaN(inicio.getTime())) {
      throw new InvalidSimulacroError(`Simulacro inicio no es ISO8601 válido: "${dto.inicio}".`);
    }
    const fin = new Date(dto.fin);
    if (Number.isNaN(fin.getTime())) {
      throw new InvalidSimulacroError(`Simulacro fin no es ISO8601 válido: "${dto.fin}".`);
    }
    return new Simulacro({
      id: dto.id,
      area: dto.area,
      name: dto.name,
      count: dto.count,
      inicio,
      fin,
      estado: new EstadoSimulacro(dto.estado),
    });
  }

  // Clasificación por (status, endpoint), nunca por message del body.
  private classifyGetError(err: unknown): Error {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) return new SessionExpiredError();
      if (err.status === 0 || err.status >= 500) return new NetworkError();
    }
    if (err instanceof InvalidSimulacroError) return err;
    return new NetworkError();
  }

  // Clasificación del POST /envio. 409 es idempotencia: el backend acepta
  // y devuelve el estado ya enviado — lo tratamos como éxito reutilizando
  // los campos del body. Solo clasificamos por (status, endpoint, code);
  // NUNCA por el `message` del body.
  private classifyEnvioError(err: unknown, req: EnvioRequest): Error {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0 || err.status >= 500) return new NetworkError();
      if (err.status === 401) return new SessionExpiredError();
      const body = (err.error ?? {}) as EnvioErrorDto;
      if (err.status === 409) {
        // Idempotencia: el envío ya existía. Reusamos los campos del body
        // si están presentes; si no, fallback al request.
        const ok: EnvioOkDto = {
          status: 'enviado',
          clientSubmittedAt:
            (err.error as Partial<EnvioOkDto>)?.clientSubmittedAt ?? req.clientSubmittedAt,
          serverReceivedAt: (err.error as Partial<EnvioOkDto>)?.serverReceivedAt ?? '',
        };
        return new IdempotentEnvioMarker(ok);
      }
      if (err.status === 400 && body.code === 'INVALID_TIME') {
        return new InvalidSubmissionTimeError();
      }
      if (err.status === 400 && body.code === 'INVALID_SHAPE') {
        return new InvalidPayloadError();
      }
      if (err.status === 400) return new InvalidPayloadError();
      if (err.status === 403 && body.code === 'CLOSED') {
        return new SimulacroCerradoError();
      }
      if (err.status === 404) return new SimulacroNoAsignadoError();
    }
    return new NetworkError();
  }
}

// Marker interno para colapsar 409 (idempotencia) en éxito sin perder los
// campos del body. El método público convierte esto antes de devolver al
// caller, así el use case y los tests nunca lo ven.
class IdempotentEnvioMarker extends Error {
  constructor(public readonly result: EnvioOkDto) {
    super('idempotent');
    this.name = 'IdempotentEnvioMarker';
  }
}
