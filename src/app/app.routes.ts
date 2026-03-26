import { Routes } from '@angular/router';
import { Registerpage } from './registerpage/registerpage';
import { Loginpage } from './loginpage/loginpage';
import { Homepage } from './homepage/homepage';
// import { StudentDashboardComponent } from './student-dashboard/student-dashboard';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { AdminProfile } from './admin-profile/admin-profile';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';
import { SignupSuccessComponent } from './signup-success/signup-success.component';
import { roleGuard } from './role/role';
import { AdminApprovalPendingComponent } from './admin-approval-pending/admin-approval-pending.component';

export const routes: Routes = [
  { path: '', component: Homepage },

  { path: 'register', component: Registerpage },
  { path: 'login', component: Loginpage },
  { path: 'signup-success', component: SignupSuccessComponent },
  { path: 'admin-approval-pending', component: AdminApprovalPendingComponent },

  {
    path: 'student-dashboard',
    redirectTo: 'new-student-dashboard',
    pathMatch: 'full'
  },

  {
    path: 'admin-dashboard',
    component: AdminDashboard,
    canActivate: [roleGuard('college_admin')]
  },

  {
    path: 'admin-profile',
    component: AdminProfile,
    canActivate: [roleGuard('college_admin')]
  },

  {
    path: 'super-admin-dashboard',
    component: SuperAdminDashboard,
    canActivate: [roleGuard('super_admin')]
  },

  {
    path: 'new-student-dashboard',
    loadComponent: () => import('./student-dashboard-page/student-dashboard-page.component').then(m => m.StudentDashboardPageComponent),
    canActivate: [roleGuard('student')]
  },

  {
    path: 'student-events',
    loadComponent: () => import('./student-events-page/student-events-page.component').then(m => m.StudentEventsPageComponent),
    canActivate: [roleGuard('student')]
  },

  {
    path: 'student-event/:id',
    loadComponent: () => import('./student-event-details-page/student-event-details-page.component').then(m => m.StudentEventDetailsPageComponent),
    canActivate: [roleGuard('student')]
  },

  {
    path: 'student-registrations',
    loadComponent: () => import('./student-registrations-page/student-registrations-page.component').then(m => m.StudentRegistrationsPageComponent),
    canActivate: [roleGuard('student')]
  },

  {
    path: 'student-profile',
    loadComponent: () => import('./student-profile-page/student-profile-page.component').then(m => m.StudentProfilePageComponent),
    canActivate: [roleGuard('student')]
  }
];

