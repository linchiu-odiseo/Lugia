import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-update-confirm-modal',
  standalone: true,
  templateUrl: './update-confirm-modal.component.html',
  styleUrl: './update-confirm-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateConfirmModalComponent implements AfterViewInit {
  @Input({ required: true }) fromVersion = '';
  @Input({ required: true }) toVersion = '';

  @Output() readonly dismiss = new EventEmitter<void>();
  @Output() readonly accept = new EventEmitter<void>();

  @ViewChild('primaryButton') private readonly primaryButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    // Foco inicial en Actualizar — el botón con la acción esperada. Cancelar
    // queda como segundo tab.
    queueMicrotask(() => this.primaryButton?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dismiss.emit();
  }
}
