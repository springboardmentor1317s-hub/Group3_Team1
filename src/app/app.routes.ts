import { Routes } from '@angular/router';
import { Registerpage } from './registerpage/registerpage';
import { Loginpage } from './loginpage/loginpage';
import { Homepage } from './homepage/homepage';
// import { StudentDashboardComponent } from './student-dashboard/student-dashboard';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { AdminProfilePageComponent } from './admin-profile/admin-profile-page';
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
    component: AdminProfilePageComponent,
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-my-events',
    loadComponent: () => import('./admin-my-events/admin-my-events.component').then(m => m.AdminMyEventsComponent),
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-my-events/:id',
    loadComponent: () => import('./admin-event-comments/admin-event-comments.component').then(m => m.AdminEventCommentsComponent),
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-registration-details',
    loadComponent: () => import('./admin-registration-details/admin-registration-details.component').then(m => m.AdminRegistrationDetailsComponent),
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-old-events',
    loadComponent: () => import('./admin-old-events/admin-old-events.component').then(m => m.AdminOldEventsComponent),
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-create-event',
    loadComponent: () => import('./create-event/admin-create-event-page.component').then(m => m.AdminCreateEventPageComponent),
    canActivate: [roleGuard('college_admin')]
  },
  {
    path: 'admin-attendance-screen',
    loadComponent: () => import('./admin-attendance-workspace/admin-attendance-workspace.component').then(m => m.AdminAttendanceWorkspaceComponent),
    canActivate: [roleGuard('college_admin')]
  },

  {
    path: 'super-admin-dashboard',
    component: SuperAdminDashboard,
    canActivate: [roleGuard('super_admin')]
  },

  {
    path: 'super-admin/students',
    loadComponent: () => import('./super-admin-dashboard/super-admin-students.component').then(m => m.SuperAdminStudentsComponent),
    canActivate: [roleGuard('super_admin')]
  },

  {
    path: 'super-admin/admins',
    loadComponent: () => import('./super-admin-dashboard/super-admin-admins.component').then(m => m.SuperAdminAdminsComponent),
    canActivate: [roleGuard('super_admin')]
  },

  {
    path: 'super-admin/events',
    loadComponent: () => import('./super-admin-dashboard/super-admin-events.component').then(m => m.SuperAdminEventsComponent),
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
    path: 'student-event-registration/:id',
    loadComponent: () => import('./student-event-registration-page/student-event-registration-page.component').then(m => m.StudentEventRegistrationPageComponent),
    canActivate: [roleGuard('student')]
  },
  {
    path: 'student-payment-success',
    loadComponent: () => import('./student-payment-success/student-payment-success.component').then(m => m.StudentPaymentSuccessComponent),
    canActivate: [roleGuard('student')]
  },
  {
    path: 'student-payment-failure',
    loadComponent: () => import('./student-payment-failure/student-payment-failure.component').then(m => m.StudentPaymentFailureComponent),
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
  },

  {
    path: 'student-feedback',
    loadComponent: () => import('./student-feedback-page/student-feedback-page.component').then(m => m.StudentFeedbackPageComponent),
    canActivate: [roleGuard('student')]
  },
  {
    path: 'student-notifications',
    loadComponent: () => import('./notifications-page/notifications-page.component').then(m => m.NotificationsPageComponent),
    canActivate: [roleGuard('student')]
  },
  {
    path: 'admin-notifications',
    loadComponent: () => import('./notifications-page/notifications-page.component').then(m => m.NotificationsPageComponent),
    canActivate: [roleGuard('college_admin')]
  }
];

