import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tabs-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tabs-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabsBarComponent {
  @Input() currentTab: string = '';
  @Input() diffInput: string = '';
  @Input() isAnalyzing: boolean = false;
  @Input() analysisHistory: any[] = [];
  @Input() analysisData: any = null;
  @Input() dashboardMetrics: any = null;
  @Input() autoFixes: any = null;
  @Input() generatedTests: any = null;
  @Input() archReview: any = null;

  @Output() switchTabAction = new EventEmitter<string>();
}
