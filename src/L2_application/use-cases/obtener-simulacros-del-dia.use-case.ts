import { Clock } from '../../L1_domain/ports/clock';
import { Simulacro } from '../../L1_domain/entities/simulacro';
import { SimulacrosApi } from '../../L1_domain/ports/simulacros-api';

// Lee la lista de simulacros del día desde el backend y, como side-effect,
// ancla el `Clock` con el `serverTime` reportado. Los countdowns de la UI
// pasan automáticamente a estar anclados al servidor desde el primer GET.
export class ObtenerSimulacrosDelDiaUseCase {
  constructor(
    private readonly api: SimulacrosApi,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly Simulacro[]> {
    const result = await this.api.obtenerDelDia();
    this.clock.setServerTime(result.serverTime);
    return result.simulacros;
  }
}
