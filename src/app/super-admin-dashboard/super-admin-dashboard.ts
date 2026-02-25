import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth } from '../auth/auth';

@Component({
    selector: 'app-super-admin-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './super-admin-dashboard.html',
    styleUrls: ['./super-admin-dashboard.css']
})
export class SuperAdminDashboard {

    constructor(private auth: Auth, private router: Router) { }

    logout() {
        this.auth.logout();
        this.router.navigate(['/login']);
    }
}
 


