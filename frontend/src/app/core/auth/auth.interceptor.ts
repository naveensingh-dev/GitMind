import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from './token.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getToken();

  // Clone the request and add the authorization header if the token exists
  if (token) {
    console.log(`[AuthInterceptor] Perfect. Adding token to ${req.url}`);
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  } else {
    // We don't log warning for static assets or auth init requests
    if (!req.url.includes('/assets/') && !req.url.includes('/auth/github')) {
      console.warn(`[AuthInterceptor] No token found for ${req.url}`);
    }
  }

  return next(req);
};
