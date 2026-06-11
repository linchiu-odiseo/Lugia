import { EstadoSimulacro } from '../value-objects/estado-simulacro';
import { InvalidSimulacroError } from '../errors/invalid-simulacro.error';

// Entidad Simulacro. El estado lo deriva el backend en cada GET.
// inicio < fin se valida en construcción — un simulacro con ventana
// degenerada es un bug de backend que el cliente rechaza explícitamente.
export class Simulacro {
  public readonly id: string;
  public readonly area: string;
  public readonly name: string;
  public readonly count: number;
  public readonly inicio: Date;
  public readonly fin: Date;
  public readonly estado: EstadoSimulacro;

  constructor(params: {
    id: string;
    area: string;
    name: string;
    count: number;
    inicio: Date;
    fin: Date;
    estado: EstadoSimulacro;
  }) {
    const id = (params.id ?? '').trim();
    if (id.length === 0) {
      throw new InvalidSimulacroError('Simulacro requiere un id no vacío.');
    }
    const area = (params.area ?? '').trim();
    if (area.length === 0) {
      throw new InvalidSimulacroError('Simulacro requiere un área no vacía.');
    }
    const name = (params.name ?? '').trim();
    if (name.length === 0) {
      throw new InvalidSimulacroError('Simulacro requiere un name no vacío.');
    }
    if (!Number.isInteger(params.count) || params.count <= 0) {
      throw new InvalidSimulacroError(
        `Simulacro count debe ser entero positivo. Recibido: ${params.count}.`,
      );
    }
    if (!(params.inicio instanceof Date) || Number.isNaN(params.inicio.getTime())) {
      throw new InvalidSimulacroError('Simulacro requiere inicio Date válido.');
    }
    if (!(params.fin instanceof Date) || Number.isNaN(params.fin.getTime())) {
      throw new InvalidSimulacroError('Simulacro requiere fin Date válido.');
    }
    if (params.fin.getTime() <= params.inicio.getTime()) {
      throw new InvalidSimulacroError('Simulacro fin debe ser posterior a inicio.');
    }
    if (!(params.estado instanceof EstadoSimulacro)) {
      throw new InvalidSimulacroError('Simulacro requiere un EstadoSimulacro válido.');
    }

    this.id = id;
    this.area = area;
    this.name = name;
    this.count = params.count;
    this.inicio = params.inicio;
    this.fin = params.fin;
    this.estado = params.estado;
  }
}
