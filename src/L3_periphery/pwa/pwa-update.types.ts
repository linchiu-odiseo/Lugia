// Estado público del PwaUpdateService consumido por la UI.
//
// `available`: el banner debe ser visible. Resultado de combinar
//   "hay una versión nueva descargada" Y "la ruta actual no es un simulacro
//   en curso" (gating C — ver design.md D2).
// `fromVersion` / `toVersion`: SemVer humano leído desde
//   `ngsw.json.appData.version`. Cae a VERSION_FALLBACK si `appData` falta
//   (instalaciones previas a esta feature).
export interface PendingUpdate {
  available: boolean;
  fromVersion: string;
  toVersion: string;
}

export const EMPTY_PENDING_UPDATE: PendingUpdate = {
  available: false,
  fromVersion: '',
  toVersion: '',
};

// Em dash mostrado en el modal cuando `appData.version` no está disponible
// (typicamente la primera vez que un cliente legacy actualiza a una versión
// con esta feature). No bloquea la activación.
export const VERSION_FALLBACK = '—';

// Mínimo entre dos `checkForUpdate()` disparados por visibilitychange.
// Evita que alternar apps rápido spamee al server.
export const CHECK_THROTTLE_MS = 60_000;
