// El adapter L3 lanza este error desde el POST stub durante el change
// `fase-3-exam-list-learnex`. El POST real aterriza en Change 2
// `fase-3-exam-submit-learnex`.
//
// Hereda DIRECTAMENTE de `Error`, NUNCA de `NetworkError`. Si extendiera
// `NetworkError`, `EnviarSimulacroUseCase` lo agarraría en su catch y
// acumularía el envío en el outbox IDB indefinidamente — ése es el riesgo
// que esta clase independiente evita.
export class SubmissionNotAvailableError extends Error {
  constructor(message = 'El envío al servidor no está disponible todavía.') {
    super(message);
    this.name = 'SubmissionNotAvailableError';
  }
}
