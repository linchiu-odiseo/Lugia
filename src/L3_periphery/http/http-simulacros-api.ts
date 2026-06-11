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

@Injectable({ providedIn: 'root' })
export class HttpSimulacrosApi implements SimulacrosApi {
  private readonly http = inject(HttpClient);

  async obtenerDelDia(): Promise<SimulacrosListResult> {
    try {
      const dto = await firstValueFrom(
        this.http.get<SimulacrosListResponseDto>(
          `${environment.apiBaseUrl}/simulacros`,
        ),
      );
      return {
        simulacros: dto.simulacros.map((s) => this.toSimulacro(s)),
        serverTime: new ServerTime(dto.serverTime),
      };
    } catch (err) {
      throw this.classifyGetError(err);
    }
  }

  // Stub: la implementación completa (mapeo 200/409/400/403/404 a errores
  // de dominio) llega en sec.9 junto con EnviarSimulacroUseCase. Por ahora
  // un stub explícito que el caller no debería invocar.
  async enviar(_req: EnvioRequest): Promise<EnvioResult> {
    throw new Error('HttpSimulacrosApi.enviar() pendiente — implementar en sec.9.');
  }

  private toSimulacro(dto: SimulacroDto): Simulacro {
    const inicio = new Date(dto.inicio);
    if (Number.isNaN(inicio.getTime())) {
      throw new InvalidSimulacroError(
        `Simulacro inicio no es ISO8601 válido: "${dto.inicio}".`,
      );
    }
    const fin = new Date(dto.fin);
    if (Number.isNaN(fin.getTime())) {
      throw new InvalidSimulacroError(
        `Simulacro fin no es ISO8601 válido: "${dto.fin}".`,
      );
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
}
