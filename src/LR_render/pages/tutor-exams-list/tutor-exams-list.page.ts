import { Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TutorExamsListViewModel } from '../../view-models/tutor-exams-list.view-model';
import { TutorExam } from '../../../L1_domain/entities/tutor-exam';

// Lista de exámenes virtuales del tutor en /tutor/home.
// El VM se provee localmente — cada montaje arranca limpio sus timers.
@Component({
  selector: 'app-tutor-exams-list-page',
  templateUrl: './tutor-exams-list.page.html',
  styleUrl: './tutor-exams-list.page.scss',
  providers: [TutorExamsListViewModel],
})
export class TutorExamsListPage {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly vm = inject(TutorExamsListViewModel);

  constructor() {
    void this.vm.start();
    this.destroyRef.onDestroy(() => this.vm.stop());
  }

  protected onExamCardClick(exam: TutorExam): void {
    void this.router.navigate(['/tutor/exams', exam.recordId]);
  }

  protected statusLabel(exam: TutorExam): string {
    switch (exam.serverStatus.value) {
      case 'scheduled':
        return 'Programado';
      case 'in_progress':
        return 'En curso';
      case 'finalized':
        return 'Finalizado';
    }
  }

  protected countDisplay(exam: TutorExam): string {
    return exam.count === null ? '—' : String(exam.count);
  }

  protected onSignOut(): void {
    void this.vm.signOut();
  }
}
