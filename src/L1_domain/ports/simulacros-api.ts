import { Simulacro } from '../entities/simulacro';
import { ServerTime } from '../value-objects/server-time';
import { AnswersMap } from './markings-storage';

export interface SimulacrosListResult {
  simulacros: readonly Simulacro[];
  serverTime: ServerTime;
}

export interface EnvioRequest {
  simulacroId: string;
  answers: AnswersMap;
  clientSubmittedAt: string;
}

export interface EnvioResult {
  status: 'enviado';
  clientSubmittedAt: string;
  serverReceivedAt: string;
}

// Puerto del dominio para el backend de simulacros (GET lista + POST envío).
// Implementación concreta vive en L3 (`HttpSimulacrosApi`).
//
// Los métodos rechazan con errores de dominio según mapeo (status, endpoint):
//   - 401 cualquier endpoint              → SessionExpiredError
//   - 0 / 5xx / network                   → NetworkError
//   - POST envío 400 INVALID_TIME         → InvalidSubmissionTimeError (sec.9)
//   - POST envío 400 INVALID_SHAPE        → InvalidPayloadError (sec.9)
//   - POST envío 403 CLOSED               → SimulacroCerradoError (sec.9)
//   - POST envío 404                      → SimulacroNoAsignadoError (sec.9)
//   - POST envío 200/409                  → éxito (409 = idempotencia)
export interface SimulacrosApi {
  obtenerDelDia(): Promise<SimulacrosListResult>;
  enviar(req: EnvioRequest): Promise<EnvioResult>;
}
