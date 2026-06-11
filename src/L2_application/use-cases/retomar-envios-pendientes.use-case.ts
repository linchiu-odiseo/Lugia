import { MarkingsStorage } from '../../L1_domain/ports/markings-storage';
import { SimulacrosApi } from '../../L1_domain/ports/simulacros-api';
import { NetworkError } from '../../L1_domain/errors/network.error';

// Lee la cola de envíos pendientes y despacha cada uno con su
// `clientSubmittedAt` original (capturado en el primer intento). Reglas:
// - 200/409 → dequeue + clearMarcaciones.
// - NetworkError → deja en cola para próximo trigger (no avanza).
// - Cualquier otro error de dominio (4xx) → dequeue + clearMarcaciones
//   y log a consola: el envío no es recuperable, no retreamos indefinido.
//
// El dispatcher L3 invoca este use case al arrancar la app y cuando
// `Connectivity` cambia a online.
export class RetomarEnviosPendientesUseCase {
  constructor(
    private readonly api: SimulacrosApi,
    private readonly storage: MarkingsStorage,
  ) {}

  async execute(): Promise<void> {
    const pendientes = await this.storage.getEnviosPendientes();
    for (const envio of pendientes) {
      try {
        await this.api.enviar(envio);
        await this.storage.dequeueEnvio(envio.simulacroId);
        await this.storage.clearMarcaciones(envio.simulacroId);
      } catch (err) {
        if (err instanceof NetworkError) {
          // Dejar en cola; reintenta en el próximo trigger.
          continue;
        }
        console.warn(
          `Envío pendiente descartado para ${envio.simulacroId}:`,
          err,
        );
        await this.storage.dequeueEnvio(envio.simulacroId);
        await this.storage.clearMarcaciones(envio.simulacroId);
      }
    }
  }
}
