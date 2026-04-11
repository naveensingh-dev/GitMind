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
  @Input() nodeStates: Record<string, string> = {};

  isMinimized = false;
  isHidden = false;

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
  }

  closePanel() {
    this.isHidden = true;
  }

  // Auto-reset state when analysis starts
  ngOnChanges(changes: any) {
    if (changes.isAnalyzing && changes.isAnalyzing.currentValue === true) {
      this.isHidden = false;
      this.isMinimized = false;
    }
  }

  // For the UI to show steps
  readonly pipelineSteps = [
    { id: 'input', label: 'Parse', icon: '📥' },
    { id: 'multi_review', label: 'Review', icon: '🔍' },
    { id: 'arbitrate', label: 'Merge', icon: '🔀' },
    { id: 'critique', label: 'Critique', icon: '🧠' },
    { id: 'human_review', label: 'Human', icon: '👤' },
    { id: 'refine', label: 'Refine', icon: '🔄' },
    { id: 'output', label: 'Final', icon: '✅' }
  ];
}
