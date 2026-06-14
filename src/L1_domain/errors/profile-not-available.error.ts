export class ProfileNotAvailableError extends Error {
  constructor(message = 'Profile not available') {
    super(message);
    this.name = 'ProfileNotAvailableError';
  }
}
