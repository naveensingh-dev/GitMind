import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-human-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './human-feedback.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HumanFeedbackComponent {
  @Input() isAwaitingFeedback: boolean = false;
  @Input() userFeedback: string = '';
  @Output() userFeedbackChange = new EventEmitter<string>();
  @Output() submitFeedbackAction = new EventEmitter<void>();
}
