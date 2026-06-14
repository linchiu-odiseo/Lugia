// Puerto del dominio para navegación programática.
// Permite que L2 (use cases) desencadene navegaciones sin importar `@angular/router`.
// Implementación concreta: se provee en `app.config.ts` como wrapper de `Router`.
export interface RouterPort {
  navigate(commands: unknown[]): void;
}
