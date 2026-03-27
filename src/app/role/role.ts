import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';

function normalizeRole(role: string | null): string {
  const value = String(role || '').toLowerCase();
  if (value === 'admin') return 'college_admin';
  return value;
}

export const roleGuard = (allowedRole: string): CanActivateFn => {
  return (_route, state) => {
    const auth = inject(Auth);
    const router = inject(Router);

    const roleFromStorage = auth.getRole();
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const fallbackRole = currentUser?.role ? String(currentUser.role) : null;
    const effectiveRoleRaw = roleFromStorage || fallbackRole;
    const effectiveRole = normalizeRole(effectiveRoleRaw);
    const requiredRole = normalizeRole(allowedRole);

    if (effectiveRole && effectiveRole === requiredRole) {
      if (requiredRole === 'student') {
        const profileCompleted = currentUser?.profileCompleted !== false;
        const isProfileRoute = state.url.startsWith('/student-profile');

        if (!profileCompleted && !isProfileRoute) {
          return router.createUrlTree(['/student-profile'], {
            queryParams: {
              requireProfileUpdate: '1',
              redirectTo: state.url
            }
          });
        }
      }

      if (!roleFromStorage && effectiveRoleRaw) {
        localStorage.setItem('role', effectiveRoleRaw);
      }
      return true;
    }

    router.navigate(['/login']);
    return false;
  };
};
