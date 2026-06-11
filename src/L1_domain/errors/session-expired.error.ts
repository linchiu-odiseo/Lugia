// Cualquier endpoint protegido que devuelva 401 mid-operación dispara este
// error. El consumer típico es el flujo de logout silencioso + redirect a
// /login. Se distingue de `InvalidCredentialsError` (que solo aplica a login).
export class SessionExpiredError extends Error {
  constructor(message = 'Sesión expirada, inicia sesión nuevamente.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}
