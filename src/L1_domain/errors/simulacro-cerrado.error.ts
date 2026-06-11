// El backend reporta que el simulacro ya está `cerrado` (pasó `fin` sin
// envío y entró a estado terminal). El cliente debe mostrar el mensaje
// "Este simulacro ya cerró" y navegar al alumno a /home.
export class SimulacroCerradoError extends Error {
  constructor(message = 'Este simulacro ya cerró.') {
    super(message);
    this.name = 'SimulacroCerradoError';
  }
}
