// Setup global para los tests del proyecto.
// Se referencia desde angular.json -> test target -> setupFiles.
//
// El builder @angular/build:unit-test corre en entorno node por defecto y no
// expone globalThis.localStorage / sessionStorage (solo el DOM interno que
// Angular usa para TestBed.createComponent). Aquí polyfilleamos un Storage
// in-memory mínimo para que los adapters de L3 que consumen `localStorage`
// puedan testearse sin levantar jsdom.

class InMemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  [name: string]: unknown;
}

const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage };
if (typeof g.localStorage === 'undefined') {
  g.localStorage = new InMemoryStorage();
}
if (typeof g.sessionStorage === 'undefined') {
  g.sessionStorage = new InMemoryStorage();
}
