import { Component, Input, ChangeDetectionStrategy, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import mermaid from 'mermaid';

@Component({
  selector: 'app-arch-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arch-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArchTabComponent implements AfterViewChecked {
  @Input() archReview: any = null;

  ngAfterViewChecked() {
    if (this.archReview) {
      try {
        mermaid.init(undefined, document.querySelectorAll('.mermaid'));
      } catch (e) {
        console.warn('Mermaid render issue:', e);
      }
    }
  }
}
