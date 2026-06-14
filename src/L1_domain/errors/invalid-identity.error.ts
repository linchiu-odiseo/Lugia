export class InvalidIdentityError extends Error {
  constructor(message = 'Identity inválida.') {
    super(message);
    this.name = 'InvalidIdentityError';
  }
}
