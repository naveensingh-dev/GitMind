import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LogEntry {
  time: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'accent';
  msg: string;
}

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="log-section" style="padding-bottom:20px">
      <div class="section-label" style="padding:14px 0 0">Activity Log</div>
      <div class="log-box">
        <div class="log-line" *ngFor="let log of logs()">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg" [ngClass]="log.type">{{ log.msg }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  `]
})
export class ActivityLogComponent {
  logs = input<LogEntry[]>([]);
}
