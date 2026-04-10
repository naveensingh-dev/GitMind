import { Component, Input, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-tests-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tests-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestsPanelComponent {
  @Input() generatedTests: any = null;

  private sanitizer = inject(DomSanitizer);
  private _highlightCache = new Map<string, SafeHtml>();
  private _highlightCacheMax = 1000;

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
