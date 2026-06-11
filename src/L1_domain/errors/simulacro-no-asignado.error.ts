// El backend reporta 404: el simulacroId NO está asignado al usuario
// autenticado. Puede ocurrir si el profesor lo retira mid-día o si el
// cliente tiene un id stale en cola. UI: refrescar /home.
export class SimulacroNoAsignadoError extends Error {
  constructor(message = 'Este simulacro no está asignado a tu cuenta.') {
    super(message);
    this.name = 'SimulacroNoAsignadoError';
  }
}
