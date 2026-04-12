import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { LoginComponent } from './features/auth/login/login.component';
import { AuthCallbackComponent } from './features/auth/callback/callback.component';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';

export const routes: Routes = [
  { 
    path: '', 
    component: DashboardComponent,
    canActivate: [authGuard] 
  },
  { 
    path: 'login', 
    component: LoginComponent,
    canActivate: [guestGuard]
  },
  { 
    path: 'auth/callback', 
    component: AuthCallbackComponent 
  },
  { 
    path: '**', 
    redirectTo: '' 
  }
];
