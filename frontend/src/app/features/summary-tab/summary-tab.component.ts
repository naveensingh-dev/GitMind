import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

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

  getApprovalInfo() {
    const data = this.analysisData;
    if (!data) return null;
    
    const statusMap = {
      approved: { icon: '✅', label: 'Approved', sub: 'Ready to merge', cls: 'approved' },
      needs_changes: { icon: '⚠️', label: 'Needs Changes', sub: 'Address issues before merging', cls: 'needs_changes' },
      rejected: { icon: '❌', label: 'Rejected', sub: 'Significant issues require attention', cls: 'rejected' }
    };
    return (statusMap as any)[data.approval_status] || statusMap['needs_changes'];
  }
}
