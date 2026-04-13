import { inject, PLATFORM_ID } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { isPlatformServer } from '@angular/common';
import { AuthService } from './auth.service';

/**
 * Prevents authenticated users from accessing guest-only routes (like /login).
 * Redirects to the root path if the user is already authenticated.
 */
export const guestGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // If we are on the server, we allow the request to pass.
  // The client-side hydration will handle the actual redirect if needed.
  if (isPlatformServer(platformId)) {
    return true;
  }

  // If we are authenticated, don't allow access to the login page
  if (authService.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }

  // Allow access for non-authenticated users
  return true;
};
