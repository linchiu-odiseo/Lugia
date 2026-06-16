import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject } from '@angular/core';

import { PwaUpdateService } from '../../../L3_periphery/pwa/pwa-update.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  templateUrl: './update-banner.component.html',
  styleUrl: './update-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateBannerComponent {
  private readonly pwa = inject(PwaUpdateService);
  readonly pendingUpdate = this.pwa.pendingUpdate;

  @Output() readonly tap = new EventEmitter<void>();
}
