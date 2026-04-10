import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-autofix-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './autofix-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AutofixPanelComponent {
  @Input() autoFixes: any = null;
  @Input() applyingFixFor: string | null = null;
  @Output() applyFixSelected = new EventEmitter<any>();

  private sanitizer = inject(DomSanitizer);
  private _highlightCache = new Map<string, SafeHtml>();
  private _highlightCacheMax = 1000;

  onApplyFix(fix: any) {
    this.applyFixSelected.emit(fix);
  }

  highlightCode(code: string): SafeHtml {
    if (!code) return '';
    const cached = this._highlightCache.get(code);
    if (cached) return cached;
    
    let result: SafeHtml;
    try {
      const highlighted = hljs.highlightAuto(code).value;
      const cleanHtml = DOMPurify.sanitize(highlighted);
      result = this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    } catch (e) {
      const cleanHtml = DOMPurify.sanitize(code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      result = this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    }
    
    if (this._highlightCache.size >= this._highlightCacheMax) {
      this._highlightCache.clear();
    }
    this._highlightCache.set(code, result);
    return result;
  }
}
