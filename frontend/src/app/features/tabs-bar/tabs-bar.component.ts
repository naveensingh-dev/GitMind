import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabDef {
  id: string;
  icon: string;
  label: string;
  group: 'core' | 'review' | 'extras';
  color: string;   // CSS var name
  glow: string;    // rgba glow
}

@Component({
  selector: 'app-tabs-bar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="nav-rail" *ngIf="allTabs().length > 0">

      <div class="rail-section" *ngIf="coreTabs().length > 0">
        <button
          *ngFor="let tab of coreTabs(); trackBy: trackById"
          class="rail-btn"
          [class.active]="currentTab === tab.id"
          [style.--tab-color]="tab.color"
          [style.--tab-glow]="tab.glow"
          (click)="switchTabAction.emit(tab.id)"
          [attr.aria-label]="tab.label">
          <span class="rail-icon">{{ tab.icon }}</span>
          <span class="rail-label">{{ tab.label }}</span>
          <span class="rail-indicator" *ngIf="currentTab === tab.id"></span>
        </button>
      </div>

      <div class="rail-sep" *ngIf="coreTabs().length > 0 && (reviewTabs().length > 0 || extraTabs().length > 0)"></div>

      <div class="rail-section" *ngIf="reviewTabs().length > 0">
        <button
          *ngFor="let tab of reviewTabs(); trackBy: trackById"
          class="rail-btn"
          [class.active]="currentTab === tab.id"
          [style.--tab-color]="tab.color"
          [style.--tab-glow]="tab.glow"
          (click)="switchTabAction.emit(tab.id)"
          [attr.aria-label]="tab.label">
          <span class="rail-icon">{{ tab.icon }}</span>
          <span class="rail-label">{{ tab.label }}</span>
          <span class="rail-indicator" *ngIf="currentTab === tab.id"></span>
        </button>
      </div>

      <div class="rail-sep" *ngIf="reviewTabs().length > 0 && extraTabs().length > 0"></div>

      <div class="rail-section" *ngIf="extraTabs().length > 0">
        <button
          *ngFor="let tab of extraTabs(); trackBy: trackById"
          class="rail-btn"
          [class.active]="currentTab === tab.id"
          [style.--tab-color]="tab.color"
          [style.--tab-glow]="tab.glow"
          (click)="switchTabAction.emit(tab.id)"
          [attr.aria-label]="tab.label">
          <span class="rail-icon">{{ tab.icon }}</span>
          <span class="rail-label">{{ tab.label }}</span>
          <span class="rail-indicator" *ngIf="currentTab === tab.id"></span>
        </button>
      </div>

    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .nav-rail {
      width: 92px;
      min-width: 92px;
      background: var(--bg1);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 12px 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
      flex-shrink: 0;
    }
    .nav-rail::-webkit-scrollbar { display: none; }

    .rail-section {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 8px;
    }

    .rail-sep {
      height: 1px;
      background: var(--border);
      margin: 10px 16px;
      flex-shrink: 0;
    }

    .rail-btn {
      all: unset;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 10px 4px 9px;
      border-radius: 8px;
      cursor: pointer;
      position: relative;
      transition: background 0.18s, transform 0.15s;
      color: var(--text3);
      text-align: center;
    }

    .rail-btn:hover {
      background: rgba(255,255,255,0.05);
      color: var(--text);
      transform: translateX(2px);
    }

    .rail-btn.active {
      background: color-mix(in srgb, var(--tab-color) 10%, transparent);
      color: var(--tab-color);
    }

    .rail-icon {
      font-size: 18px;
      line-height: 1;
      display: block;
      transition: transform 0.2s;
    }

    .rail-btn:hover .rail-icon {
      transform: scale(1.15);
    }

    .rail-label {
      font-family: var(--sans);
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.01em;
      line-height: 1.2;
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 72px;
    }

    .rail-indicator {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 60%;
      border-radius: 0 3px 3px 0;
      background: var(--tab-color);
      box-shadow: 2px 0 10px var(--tab-glow);
    }
  `]
})
export class TabsBarComponent {
  @Input() currentTab: string = '';
  @Input() diffInput: string = '';
  @Input() isAnalyzing: boolean = false;
  @Input() analysisHistory: any[] = [];
  @Input() analysisData: any = null;
  @Input() dashboardMetrics: any = null;
  @Input() autoFixes: any = null;
  @Input() generatedTests: any = null;
  @Input() archReview: any = null;

  @Output() switchTabAction = new EventEmitter<string>();

  trackById(_: number, tab: TabDef) { return tab.id; }

  allTabs(): TabDef[] {
    return [...this.coreTabs(), ...this.reviewTabs(), ...this.extraTabs()];
  }

  coreTabs(): TabDef[] {
    const tabs: TabDef[] = [];
    // Always allow history access
    tabs.push({ id: 'history', icon: '📂', label: 'History', group: 'core', color: '#00ffa3', glow: 'rgba(0,255,163,0.4)' });
    
    if (this.diffInput) {
      tabs.push({ id: 'diff', icon: '🔍', label: 'Diff', group: 'core', color: '#00ffa3', glow: 'rgba(0,255,163,0.4)' });
      tabs.push({ id: 'logs', icon: '📝', label: 'Logs', group: 'core', color: '#00ffa3', glow: 'rgba(0,255,163,0.4)' });
    }
    return tabs;
  }

  reviewTabs(): TabDef[] {
    if (!this.analysisData) return [];
    const tabs: TabDef[] = [];
    if (this.dashboardMetrics) {
      tabs.push({ id: 'analytics', icon: '📊', label: 'Analytics', group: 'review', color: '#38d4f5', glow: 'rgba(56,212,245,0.4)' });
    }
    tabs.push({ id: 'summary', icon: '📋', label: 'Summary', group: 'review', color: '#38d4f5', glow: 'rgba(56,212,245,0.4)' });
    if (this.analysisData?.security?.length) {
      tabs.push({ id: 'security', icon: '🔐', label: 'Security', group: 'review', color: '#f87171', glow: 'rgba(248,113,113,0.4)' });
    }
    if (this.analysisData?.performance?.length) {
      tabs.push({ id: 'performance', icon: '⚡', label: 'Perf', group: 'review', color: '#fbbf24', glow: 'rgba(251,191,36,0.4)' });
    }
    if (this.analysisData?.style?.length) {
      tabs.push({ id: 'style', icon: '🎨', label: 'Style', group: 'review', color: '#38d4f5', glow: 'rgba(56,212,245,0.4)' });
    }
    tabs.push({ id: 'report', icon: '📄', label: 'Report', group: 'review', color: '#38d4f5', glow: 'rgba(56,212,245,0.4)' });
    return tabs;
  }

  extraTabs(): TabDef[] {
    const tabs: TabDef[] = [];
    const hasFixes = this.autoFixes || this.analysisData?.auto_fixes;
    const hasTests = this.generatedTests || this.analysisData?.generated_tests;
    const hasArch = this.archReview || this.analysisData?.arch_review;

    if (hasFixes) {
      tabs.push({ id: 'autofix', icon: '🔧', label: 'Auto-Fix', group: 'extras', color: '#a78bfa', glow: 'rgba(167,139,250,0.4)' });
    }
    if (hasTests) {
      tabs.push({ id: 'tests', icon: '🧪', label: 'Tests', group: 'extras', color: '#a78bfa', glow: 'rgba(167,139,250,0.4)' });
    }
    if (hasArch) {
      tabs.push({ id: 'arch', icon: '🏗️', label: 'Arch', group: 'extras', color: '#a78bfa', glow: 'rgba(167,139,250,0.4)' });
    }
    return tabs;
  }

  hasReviewTabs(): boolean { return this.reviewTabs().length > 0; }
  hasExtraTabs(): boolean { return this.extraTabs().length > 0; }
}
