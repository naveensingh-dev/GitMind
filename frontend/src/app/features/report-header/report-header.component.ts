import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-report-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportHeaderComponent {
  @Input() diffInput: string = '';
  @Input() analysisData: any = null;
  @Input() selectedModel: string = '';
  @Input() totalStats: any = { files: 0, additions: 0, deletions: 0 };
}
