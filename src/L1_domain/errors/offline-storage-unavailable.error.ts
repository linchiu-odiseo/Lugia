// Se lanza cuando el adapter de MarkingsStorage no puede operar — sea
// porque el browser no expone IndexedDB (incognito en algunos casos), o
// porque la operación falló en runtime. La UI lo trata como condición
// bloqueante: muestra banner persistente y deshabilita entrada a simulacros.
export class OfflineStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineStorageUnavailableError';
  }
}
