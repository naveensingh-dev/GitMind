import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-overlays',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './overlays.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverlaysComponent {
  @Input() errorMessage: string | null = null;
  @Input() successMessage: string | null = null;
  @Output() clearErrorAction = new EventEmitter<void>();
  @Output() clearSuccessAction = new EventEmitter<void>();
}
