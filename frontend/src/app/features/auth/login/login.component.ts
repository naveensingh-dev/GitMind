import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-container">
      <div class="glass-login-box">
        <div class="glow-sphere"></div>
        <div class="login-content">
          <div class="logo">🚀</div>
          <h1>GitMind Neural IDE</h1>
          <p class="subtitle">The Enterprise AI Code Intelligence Platform</p>
          
          <div class="features-list">
            <div class="feature-item">
              <span class="icon">🛡️</span>
              <span class="text">Security-First Multi-Persona Review</span>
            </div>
            <div class="feature-item">
              <span class="icon">⚡</span>
              <span class="text">Async Job Queue & Scalable Workers</span>
            </div>
            <div class="feature-item">
              <span class="icon">📦</span>
              <span class="text">Automated Staged Code Remediation</span>
            </div>
          </div>

          <button (click)="login()" class="github-login-btn">
            <svg class="github-icon" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
          
          <p class="footer">By logging in, you agree to the enterprise data privacy policy.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      height: 100vh;
      width: 100vw;
      background: #05070a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      position: relative;
    }

    .glow-sphere {
      position: absolute;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(0, 255, 163, 0.15) 0%, transparent 70%);
      filter: blur(40px);
      z-index: 0;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }

    .glass-login-box {
      width: 440px;
      background: rgba(15, 20, 30, 0.6);
      backdrop-filter: blur(40px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 48px;
      box-shadow: 0 50px 100px rgba(0, 0, 0, 0.4);
      z-index: 10;
      position: relative;
    }

    .login-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      position: relative;
      z-index: 1;
    }

    .logo {
      font-size: 48px;
      margin-bottom: 24px;
      animation: float 3s ease-in-out infinite;
    }

    h1 {
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      margin: 0 0 8px 0;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      margin-bottom: 40px;
    }

    .features-list {
      width: 100%;
      margin-bottom: 40px;
      text-align: left;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .feature-item .icon {
      font-size: 18px;
    }

    .feature-item .text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 500;
    }

    .github-login-btn {
      width: 100%;
      height: 52px;
      background: #fff;
      color: #000;
      border: none;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin-bottom: 24px;
    }

    .github-login-btn:hover {
      background: #e5e5e5;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(255, 255, 255, 0.1);
    }

    .github-icon {
      width: 20px;
      height: 20px;
      fill: #000;
    }

    .footer {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.3);
      margin: 0;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  `]
})
export class LoginComponent {
  private authService = inject(AuthService);

  login() {
    this.authService.login();
  }
}
