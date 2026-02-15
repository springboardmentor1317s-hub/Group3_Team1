import { Routes } from '@angular/router';
import { Ragisterpage } from './registerpage/registerpage';
import { Loginpage } from './loginpage/loginpage';
import { Homepage } from './homepage/homepage';
import { StudentDashboardComponent } from './student-dashboard/student-dashboard';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';
import { roleGuard } from './role/role';


export const routes: Routes = [

  { path: '', component:  Homepage },

  { path: 'register', component: Ragisterpage },
  { path: 'login', component: Loginpage },

  {
    path: 'student-dashboard',
    component: StudentDashboardComponent,
    canActivate: [roleGuard('student')]
  },

  {
    path: 'admin-dashboard',
    component: AdminDashboard,
    canActivate: [roleGuard('college_admin')]
  },

  {
    path: 'super-admin-dashboard',
    component: SuperAdminDashboard,
    canActivate: [roleGuard('super_admin')]
  },
 {
  path: 'student-dashboard',
  component: StudentDashboardComponent
}
];

