import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { TokenService } from './token.service';

export interface User {
  id: number;
  login: string;
  name?: string;
  avatar_url: string;
  email?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private tokenService = inject(TokenService);
  
  private isBrowser = isPlatformBrowser(this.platformId);
  private baseUrl = 'http://localhost:8000/auth';

  // Current user state
  currentUser = signal<User | null>(null);
  isAuthenticated = signal<boolean>(false);

  constructor() {
    this.checkInitialAuth();
  }

  /** Initialize auth state from localStorage */
  private checkInitialAuth() {
    if (!this.isBrowser) return;
    const token = this.tokenService.getToken();
    if (token) {
      // Proactively set authenticated to true so guards pass immediately on hydration
      this.isAuthenticated.set(true);
      
      this.fetchMe().subscribe({
        next: (user) => {
          this.currentUser.set(user);
        },
        error: (err) => {
          console.error('[AuthService] Initial profile fetch failed:', err);
          // If the token is invalid (401), logout will clear state and redirect
          if (err.status === 401) {
            this.logout();
          }
        }
      });
    }
  }

  /** Login via GitHub — redirects to backend auth initiator */
  login() {
    if (!this.isBrowser) return;
    window.location.href = `${this.baseUrl}/github`;
  }

  /** Logout — clears local state and token */
  logout() {
    this.tokenService.clearToken();
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.router.navigate(['/login']);
  }

  /** Handle the token from GitHub callback */
  setToken(token: string) {
    this.tokenService.setToken(token);
    
    // Set authenticated state immediately
    this.isAuthenticated.set(true);
    
    // Explicitly fetch user info
    this.fetchMe().subscribe({
      next: (user) => {
        console.log('[AuthService] Profile fetched successfully:', user.login);
        this.currentUser.set(user);
      },
      error: (err) => {
        console.error('[AuthService] Failed to fetch profile after login:', err);
      }
    });
  }

  /** Fetch current user profile from backend */
  fetchMe(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/me`);
  }
}
