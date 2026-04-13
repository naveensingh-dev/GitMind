import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardMetrics } from '../../core/models';

@Component({
  selector: 'app-summary-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './summary-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SummaryTabComponent {
  @Input() analysisData: any;
  @Input() critiqueData: any;
  @Input() metrics: DashboardMetrics | null = null;

  getApprovalInfo() {
    const data = this.analysisData;
    if (!data) return null;
    
    const statusMap = {
      approved: { icon: '✅', label: 'Approved', sub: 'Code meets quality standards and is ready to merge', cls: 'approved' },
      needs_changes: { icon: '⚠️', label: 'Needs Changes', sub: 'Address the flagged issues before merging', cls: 'needs_changes' },
      rejected: { icon: '❌', label: 'Rejected', sub: 'Significant critical issues require immediate attention', cls: 'rejected' }
    };
    return (statusMap as any)[data.approval_status] || statusMap['needs_changes'];
  }

  getAllIssues(): any[] {
    if (!this.analysisData) return [];
    const s = this.analysisData.security || [];
    const p = this.analysisData.performance || [];
    const st = this.analysisData.style || [];
    return [...s, ...p, ...st];
  }

  getTotalIssues(): number {
    return this.getAllIssues().length;
  }

  getSevCount(severity: string): number {
    return this.getAllIssues().filter(i => i.severity === severity).length;
  }

  getSevPerc(severity: string): number {
    const total = this.getTotalIssues();
    if (total === 0) return 0;
    return (this.getSevCount(severity) / total) * 100;
  }
}
