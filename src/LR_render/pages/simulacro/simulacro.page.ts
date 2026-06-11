import { Component, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlternativaValue } from '../../../L1_domain/ports/markings-storage';
import { SimulacroPageViewModel } from '../../view-models/simulacro.view-model';

const ALTERNATIVAS: readonly AlternativaValue[] = ['A', 'B', 'C', 'D', 'E'];

@Component({
  selector: 'app-simulacro-page',
  templateUrl: './simulacro.page.html',
  styleUrl: './simulacro.page.scss',
  providers: [SimulacroPageViewModel],
})
export class SimulacroPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly vm = inject(SimulacroPageViewModel);

  protected readonly alternativas = ALTERNATIVAS;

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null || id.trim().length === 0) {
      void this.router.navigate(['/home']);
      return;
    }
    void this.vm.start(id);
    this.destroyRef.onDestroy(() => this.vm.stop());
  }

  protected onBubbleClick(pregunta: number, letra: AlternativaValue): void {
    void this.vm.marcar(pregunta, letra);
  }

  protected isMarked(pregunta: number, letra: AlternativaValue): boolean {
    return this.vm.marcaciones()[String(pregunta)] === letra;
  }

  protected onVolverClick(): void {
    this.vm.volver();
  }
}
