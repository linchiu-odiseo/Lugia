export class RefreshFailedError extends Error {
  constructor(message = 'Refresh token invalid or missing') {
    super(message);
    this.name = 'RefreshFailedError';
  }
}
