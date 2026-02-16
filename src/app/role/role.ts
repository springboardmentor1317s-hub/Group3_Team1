import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';

export const roleGuard = (allowedRole: string): CanActivateFn => {
  return () => {
    const auth = inject(Auth);
    const router = inject(Router);

    const role = auth.getRole();

    if (role === allowedRole) {
      return true;
    }

    router.navigate(['/login']);
    return false;
  };
};
