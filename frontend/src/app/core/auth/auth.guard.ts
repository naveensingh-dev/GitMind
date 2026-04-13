import { inject, PLATFORM_ID } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { isPlatformServer } from '@angular/common';
import { AuthService } from './auth.service';

/**
 * Protects routes from unauthenticated access.
 * Redirects to /login if the user is not authenticated.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // If we are on the server, we can't check localStorage.
  // We return true to allow the page to render; the client-side check 
  // will handle the real auth verification during hydration.
  if (isPlatformServer(platformId)) {
    return true;
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  // Redirect to login page
  return router.createUrlTree(['/login']);
};
