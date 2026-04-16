import { Component, Input, ChangeDetectionStrategy, inject, OnChanges, SimpleChanges } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import hljs from 'highlight.js';
import { DiffFile, DiffLine } from '../../core/models';

interface HighlightedLine extends DiffLine {
  safeHtml: SafeHtml;
}

interface HighlightedFile extends Omit<DiffFile, 'hunks'> {
  processedHunks: {
    header: string;
    processedLines: HighlightedLine[];
  }[];
}

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diff-viewer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiffViewerComponent implements OnChanges {
  @Input() files: DiffFile[] = [];
  processedFiles: HighlightedFile[] = [];

  private sanitizer = inject(DomSanitizer);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['files'] && this.files) {
      this.processFiles();
    }
  }

  processFiles() {
    this.processedFiles = this.files.map(file => ({
      ...file,
      processedHunks: file.hunks.map(hunk => ({
        header: hunk.header,
        processedLines: hunk.lines.map(line => ({
          ...line,
          safeHtml: this.highlightCode(line.content)
        }))
      }))
    }));
  }
  
  toggleFile(file: HighlightedFile) {
    file.isOpen = !file.isOpen;
    // Note: Since we are modifying an object in the array, 
    // we might need to trigger change detection or use a fresh array
    // but with OnPush, if we modify the property inside, the view should update 
    // if the event originated from the template action. 
    // However, for pure signal/immutable consistency:
    this.processedFiles = [...this.processedFiles];
  }

  private highlightCode(code: string): SafeHtml {
    if (!code || code.length === 0) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    const rawContent = code.substring(1);
    const highlighted = hljs.highlightAuto(rawContent).value;
    const marker = `<span class="diff-marker">${code.charAt(0)}</span>`;
    return this.sanitizer.bypassSecurityTrustHtml(marker + highlighted);
  }

  trackByPath(index: number, file: HighlightedFile): string {
    return file.path;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
