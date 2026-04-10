import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SafeHtml } from '@angular/platform-browser';
@Component({
  selector: 'app-raw-report-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './raw-report-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RawReportTabComponent {
  @Input() analysisData: any = null;
  @Input() selectedModel: string = '';
  @Input() renderedReport: SafeHtml | string = '';
  @Output() copyReportAction = new EventEmitter<void>();
}
