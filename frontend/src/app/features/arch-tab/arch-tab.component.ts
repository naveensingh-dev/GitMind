import { Component, Input, ChangeDetectionStrategy, AfterViewChecked, OnChanges, SimpleChanges, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import mermaid from 'mermaid';

@Component({
  selector: 'app-arch-tab',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './arch-tab.component.html',
  styleUrls: [], // Potential for scoped styles if needed
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArchTabComponent implements AfterViewChecked, OnChanges {
  @Input() archReview: any = null;
  @ViewChild('mermaidPreview') mermaidPreview!: ElementRef;
  
  isDialogOpen = false;
  private hasRendered = false;

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

  ngOnChanges(changes: SimpleChanges) {
    if (changes['archReview']) {
      this.hasRendered = false;
    }
  }

  ngAfterViewChecked() {
    if (this.archReview?.mermaid_code && !this.hasRendered) {
      this.renderMermaid();
      this.hasRendered = true;
    }
  }

  private async renderMermaid() {
    try {
      const code = this.sanitizeMermaidCode(this.archReview.mermaid_code);
      if (!code) return;

      const element = document.querySelector('.mermaid');
      if (element) {
        element.innerHTML = code;
        await mermaid.run({
          nodes: [element as HTMLElement]
        });
      }
    } catch (e) {
      console.error('Mermaid render failed:', e);
    }
  }

  private sanitizeMermaidCode(code: string): string {
    if (!code) return '';
    
    // 1. Strip markdown fences if present
    let clean = code.replace(/```mermaid/g, '').replace(/```/g, '').trim();
    
    // 2. Ensure it starts with a valid graph type if missing (fallback)
    if (!clean.startsWith('graph ') && !clean.startsWith('flowchart ')) {
      clean = 'graph TD\n' + clean;
    }

    // 3. Robust label quoting for dots (common syntax error)
    // Removed '>' from brackets because it collides with '-->' arrows.
    // Matches: ID[text.ext], ID(text.ext), ID{text.ext}, ID((text.ext))
    clean = clean.replace(/(\b[a-zA-Z0-9_-]+)(\[|\(|\{|\(\()([^\]\}\)\n]+)(\]|\)|\}|\)\))/g, (match, id, open, label, close) => {
      if (label.includes('.') && !label.startsWith('"')) {
        return `${id}${open}"${label}"${close}`;
      }
      return match;
    });

    return clean;
  }

  toggleDialog() {
    this.isDialogOpen = !this.isDialogOpen;
    if (this.isDialogOpen) {
      setTimeout(async () => {
        const modalElement = document.querySelector('.mermaid-modal');
        if (modalElement) {
          modalElement.innerHTML = this.sanitizeMermaidCode(this.archReview.mermaid_code);
          await mermaid.run({
            nodes: [modalElement as HTMLElement]
          });
        }
      }, 50);
    }
  }
}
