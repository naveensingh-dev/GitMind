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
  
  isDialogOpen = false;

  constructor() {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: 'JetBrains Mono',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'basis'
      }
    });
  }

  ngAfterViewChecked() {
    if (this.archReview) {
      try {
        mermaid.init(undefined, document.querySelectorAll('.mermaid'));
      } catch (e) {
        // Silently handle re-renders
      }
    }
  }

  toggleDialog() {
    this.isDialogOpen = !this.isDialogOpen;
    // Re-initialize mermaid when dialog opens to ensure rendering in new container
    if (this.isDialogOpen) {
      setTimeout(() => {
        mermaid.init(undefined, document.querySelectorAll('.mermaid-modal'));
      }, 50);
    }
  }
}
