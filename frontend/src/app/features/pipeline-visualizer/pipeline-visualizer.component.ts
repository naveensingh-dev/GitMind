import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pipeline-visualizer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pipeline-visualizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PipelineVisualizerComponent {
  @Input() nodeStates: Record<string, string> = {};
}
