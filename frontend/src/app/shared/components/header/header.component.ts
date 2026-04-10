import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header>
      <a class="logo" href="#">
        <div class="logo-icon">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" stroke="#00ffa3" stroke-width="1.2" opacity="0.4"/>
            <circle cx="16" cy="10" r="3.5" fill="#00ffa3" opacity="0.9"/>
            <circle cx="8" cy="22" r="3" fill="#38d4f5" opacity="0.8"/>
            <circle cx="24" cy="22" r="3" fill="#a78bfa" opacity="0.8"/>
            <line x1="16" y1="13.5" x2="8.5" y2="19.5" stroke="#00ffa3" stroke-width="1" opacity="0.5"/>
            <line x1="16" y1="13.5" x2="23.5" y2="19.5" stroke="#00ffa3" stroke-width="1" opacity="0.5"/>
            <line x1="9" y1="22" x2="21" y2="22" stroke="#38d4f5" stroke-width="1" opacity="0.4" stroke-dasharray="2 2"/>
          </svg>
        </div>
        <span class="logo-text">Git<span>Mind</span></span>
      </a>
      <div class="header-right">
        <div class="loop-indicator" *ngIf="refinementCount() > 0">
          <span class="loop-icon">↻</span>
          <span class="loop-text">Refinement loop</span>
          <span class="loop-count">×{{ refinementCount() }}</span>
        </div>
        <span class="header-badge">LangGraph · v2.2</span>
        <div class="status-dot"><div class="dot"></div><span>Agent online</span></div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .loop-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      background: rgba(251, 146, 60, 0.08);
      border: 1px solid rgba(251, 146, 60, 0.2);
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--orange);
      animation: fadeIn 0.3s ease-out;
    }
    .loop-icon {
      font-size: 14px;
      animation: spin 2s linear infinite;
    }
    .loop-text {
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .loop-count {
      background: var(--orange);
      color: #000;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 700;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class HeaderComponent {
  refinementCount = input(0);
}
