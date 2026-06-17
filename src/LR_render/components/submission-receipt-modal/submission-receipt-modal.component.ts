import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { SubmissionAck } from '../../../L1_domain/value-objects/submission-ack';

// Hash sha256 hex (64 chars) → 4 líneas, 4 grupos por línea, 4 chars por grupo.
// Convención visual del recibo: bloque cuadrado, separadores cada 4 chars,
// monoespaciado. El alumno puede dictar el hash por teléfono o comparar
// visualmente con el que reciba por otro canal.
const HEX_64_RE = /^[0-9a-f]{64}$/;
const GROUPS_PER_LINE = 4;
const CHARS_PER_GROUP = 4;
const LINES_PER_BLOCK = 4;

// Mes abreviado es-PE para "HH:MM — DD mmm YYYY". Coincide con `Intl` cuando
// pasa por el `dateTimeFormat`-es pero acá lo dejamos hardcoded para no
// depender de la implementación de runtime (jsdom usa Intl reducido) y para
// que el formato sea estable entre browsers.
const MESES_ES_ABREV: readonly string[] = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// Modal de comprobante de envío. Aparece tras un 201 de learnex. Backdrop
// con blur que NO cierra el modal por click (es recibo, no toast): solo
// el botón "Volver al inicio" emite `close`. Patrón gemelo a
// `<app-update-confirm-modal>`.
@Component({
  selector: 'app-submission-receipt-modal',
  standalone: true,
  templateUrl: './submission-receipt-modal.component.html',
  styleUrl: './submission-receipt-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubmissionReceiptModalComponent implements AfterViewInit {
  @Input({ required: true }) ack!: SubmissionAck;

  @Output() readonly closed = new EventEmitter<void>();

  @ViewChild('primaryButton') private readonly primaryButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    queueMicrotask(() => this.primaryButton?.nativeElement.focus());
    this.tryHapticPulse();
  }

  // Líneas del bloque de hash para el template. Memoizar no aporta — el ack
  // es input estable durante la vida del modal y el cálculo es ~64 ops.
  hashLines(): readonly string[] {
    return formatHashBlock(this.ack.submissionHash);
  }

  // "HH:MM — DD mmm YYYY" (mes abreviado en español). Toma hora local del
  // navegador para que coincida con la sensación del alumno; el `submittedAt`
  // ya es server-anchored al haber sido emitido por learnex.
  formattedSubmittedAt(): string {
    return formatSubmittedAt(this.ack.submittedAt);
  }

  // Pulso háptico al abrirse el modal. Espejo del patrón en
  // `simulacro.view-model.ts:tryHapticPulse()`. Reforzamos la sensación de
  // "envío recibido" en devices que lo soportan.
  private tryHapticPulse(): void {
    if (typeof navigator === 'undefined') return;
    const vibrate = (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean })
      .vibrate;
    if (typeof vibrate !== 'function') return;
    try {
      vibrate.call(navigator, [40]);
    } catch {
      // No funcional — el feedback háptico es nice-to-have.
    }
  }
}

// Helper pure exportado para tests. 64 chars hex → 4 líneas, cada una con
// 4 grupos de 4 chars separados por un espacio. Si el input no cumple la
// invariante (el VO ya lo valida, pero defensa en profundidad), loguea
// warning y retorna una sola línea con el hash crudo — el modal renderiza
// algo en vez de crashear.
export function formatHashBlock(hash: string): readonly string[] {
  if (!HEX_64_RE.test(hash)) {
    console.warn(
      `SubmissionReceiptModal: hash con shape inesperado (longitud ${hash.length}), ` +
        `renderizando fallback de una línea.`,
    );
    return hash.length === 0 ? [] : [hash];
  }
  const lines: string[] = [];
  for (let line = 0; line < LINES_PER_BLOCK; line++) {
    const groups: string[] = [];
    for (let group = 0; group < GROUPS_PER_LINE; group++) {
      const start = (line * GROUPS_PER_LINE + group) * CHARS_PER_GROUP;
      groups.push(hash.slice(start, start + CHARS_PER_GROUP));
    }
    lines.push(groups.join(' '));
  }
  return lines;
}

function formatSubmittedAt(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const mes = MESES_ES_ABREV[d.getMonth()];
  const yyyy = d.getFullYear().toString();
  return `${hh}:${mm} — ${dd} ${mes} ${yyyy}`;
}
