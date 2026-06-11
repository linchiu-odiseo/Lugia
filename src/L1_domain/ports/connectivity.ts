// Función devuelta por `subscribe()` que el caller invoca para cancelar
// la suscripción. Patrón observer puro, sin dependencias de Angular ni rxjs.
export type ConnectivityUnsubscribe = () => void;

// Puerto del dominio para el estado de conectividad de red de la PWA.
//
// `current()` da el snapshot actual (true = online).
// `subscribe(listener)` recibe TODOS los cambios futuros y devuelve un
// unsubscribe handle. El listener se invoca con el nuevo valor.
//
// Implementación concreta vive en L3 (`BrowserConnectivity`).
export interface Connectivity {
  current(): boolean;
  subscribe(listener: (isOnline: boolean) => void): ConnectivityUnsubscribe;
}
