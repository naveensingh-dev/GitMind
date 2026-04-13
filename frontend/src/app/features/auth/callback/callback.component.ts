import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="callback-container">
      <div class="loader-box">
        <div class="spinner"></div>
        <h2>Authenticating with GitHub...</h2>
        <p>Finalizing your enterprise session.</p>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      height: 100vh;
      width: 100vw;
      background: #05070a;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-family: 'Inter', sans-serif;
    }
    .loader-box {
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(0, 255, 163, 0.1);
      border-top-color: #00ffa3;
      border-radius: 50%;
      margin: 0 auto 24px;
      animation: spin 1s linear infinite;
    }
    h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.5); font-size: 14px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class AuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  ngOnInit() {
    // Extract token from query params: /auth/callback?token=...
    this.route.queryParams.subscribe(params => {
      const token = params['token'];
      if (token) {
        this.authService.setToken(token);
        // Delay slightly for UX/smooth transition
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1200);
      } else {
        this.router.navigate(['/login']);
      }
    });
  }
}
