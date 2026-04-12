import { Component, input, inject, signal, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header>
      <a class="logo" href="/">
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
        <span class="tokens-badge" *ngIf="tokensSaved() > 0" title="Tokens saved via TOON">🍃 {{ tokensSaved() | number }} saved</span>
        
        <div class="enterprise-divider"></div>

        <!-- User Profile Section -->
        <div class="user-profile" *ngIf="auth.currentUser() as user" (click)="toggleProfileMenu($event)">
          <div class="user-info">
            <span class="user-login">{{ user.login }}</span>
            <span class="user-role">Enterprise</span>
          </div>
          <img [src]="user.avatar_url" class="user-avatar" [alt]="user.login">
          
          <div class="user-dropdown" [class.show]="isProfileMenuOpen()">
            <button class="logout-btn" (click)="auth.logout()">
              <span class="icon">🚪</span> Sign Out
            </button>
          </div>
        </div>

        <div class="status-dot"><div class="dot"></div><span>Secure</span></div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; }
    
    .enterprise-divider {
      width: 1px;
      height: 20px;
      background: rgba(255,255,255,0.1);
      margin: 0 16px;
    }

    .user-profile {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px;
      padding-left: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 40px;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
      user-select: none;
    }

    .user-profile:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(0, 255, 163, 0.3);
    }

    .user-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .user-login {
      font-size: 11px;
      font-weight: 700;
      color: #fff;
      letter-spacing: 0.02em;
    }

    .user-role {
      font-size: 9px;
      text-transform: uppercase;
      color: rgba(0, 255, 163, 0.7);
      font-weight: 800;
      letter-spacing: 0.05em;
    }

    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .user-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 10px;
      background: #0a0c14;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 8px;
      min-width: 140px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      display: none;
      z-index: 100;
      animation: slideIn 0.2s ease;
    }

    .user-dropdown.show {
      display: block;
    }

    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .logout-btn {
      width: 100%;
      padding: 10px 14px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: #ff5f5f;
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s;
    }

    .logout-btn:hover {
      background: rgba(255, 95, 95, 0.1);
    }

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
    }
    .tokens-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: rgba(0, 255, 163, 0.1);
      border: 1px solid rgba(0, 255, 163, 0.25);
      border-radius: 6px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
      color: #00ffa3;
      margin-right: 8px;
    }
    .status-dot { margin-left: 12px; }
  `]
})
export class HeaderComponent {
  refinementCount = input(0);
  tokensSaved = input(0);

  auth = inject(AuthService);
  private elementRef = inject(ElementRef);
  
  isProfileMenuOpen = signal(false);

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.isProfileMenuOpen.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  closeMenu(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isProfileMenuOpen.set(false);
    }
  }
}
