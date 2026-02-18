import { Routes } from '@angular/router';
import { Registerpage } from './registerpage/registerpage';
import { Loginpage } from './loginpage/loginpage';
import { Homepage } from './homepage/homepage';
import { StudentDashboardComponent } from './student-dashboard/student-dashboard';
import { AdminDashboard } from './admin-dashboard/admin-dashboard';
import { SuperAdminDashboard } from './super-admin-dashboard/super-admin-dashboard';
import { SignupSuccessComponent } from './signup-success/signup-success.component';
import { roleGuard } from './role/role';


export const routes: Routes = [

  { path: '', component:  Homepage },

  { path: 'register', component: Registerpage },
  { path: 'login', component: Loginpage },
  { path: 'signup-success', component: SignupSuccessComponent },

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

