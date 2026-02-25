import { Routes } from '@angular/router';
import { Ragisterpage } from './registerpage/registerpage';
import { Loginpage } from './loginpage/loginpage';
import { Homepage } from './homepage/homepage';
import { StudentDashboard } from './student-dashboard/student-dashboard';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { roleGuard } from './role/role';
import { CreateEvent } from './create-event/create-event';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';

export const routes: Routes = [

  { path: '', component: Homepage },

  { path: 'register', component: Ragisterpage },
  { path: 'login', component: Loginpage },

  {
    path: 'student-dashboard',
    component: StudentDashboard,
    canActivate: [roleGuard('student')]
  },

  {
    path: 'admin-dashboard',
    component: AdminDashboard,
    canActivate: [roleGuard('college_admin')]
  },

  {path:'create-event',component: CreateEvent},

  {path:'super-admin-dashboard',component:SuperAdminDashboard}
];