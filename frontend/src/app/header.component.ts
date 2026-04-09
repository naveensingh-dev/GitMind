import { Component, input } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
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
        <div class="loop-indicator" [class.visible]="refinementCount() > 0">
          <span>↻</span><span>Refinement loop</span><span class="loop-count">×{{ refinementCount() }}</span>
        </div>
        <span class="header-badge">LangGraph · v2.2</span>
        <div class="status-dot"><div class="dot"></div><span>Agent online</span></div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class HeaderComponent {
  refinementCount = input(0);
}
