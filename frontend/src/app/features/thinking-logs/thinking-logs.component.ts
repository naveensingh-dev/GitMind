import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-thinking-logs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './thinking-logs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThinkingLogsComponent {
  @Input() isAnalyzing = false;
  @Input() logs: any[] = [];
}
