import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-analysis-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analysis-history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalysisHistoryComponent {
  @Input() analysisHistory: any[] = [];
  @Output() loadPastAnalysisAction = new EventEmitter<any>();
}
