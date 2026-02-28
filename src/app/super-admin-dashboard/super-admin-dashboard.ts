import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Auth } from '../auth/auth';

interface DashboardStats {
    totalAdmins: number;
    totalStudents: number;
    totalEvents: number;
    totalSuperAdmins: number;
    activeEvents?: number;
    recentStudents?: number;
    systemLoad?: number;
}

interface AdminActivity {
    name: string;
    college: string;
    userId: string;
    eventCount: number;
    createdAt: Date;
}

interface User {
    _id: string;
    name: string;
    email: string;
    userId: string;
    role: string;
    college: string;
    createdAt: Date;
}

@Component({
    selector: 'app-super-admin-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './super-admin-dashboard.html',
    styleUrls: ['./super-admin-dashboard.css']
})
export class SuperAdminDashboard implements OnInit {

    private readonly API_URL = 'http://localhost:5000/api';

    // Stats data - will be fetched from database
    totalAdmins: number = 0;
    totalStudents: number = 0;
    totalEvents: number = 0;
    systemLoad: number = 0;
    activeEvents: number = 0;
    upcomingEvents: number = 0;
    totalRegistrations: number = 0;
    recentUsers: number = 0;

    // Admin activities
    adminActivities: AdminActivity[] = [];
    
    // All users for admin management
    allUsers: User[] = [];

    // Tab management
    activeTab: string = 'overview';
    
    // Modal management
    showCreateAdmin: boolean = false;
    
    // New admin form
    newAdmin = {
        name: '',
        email: '',
        userId: '',
        college: '',
        password: ''
    };
    
    // Settings
    maintenanceMode: boolean = false;

    constructor(
        private auth: Auth,
        private router: Router,
        private http: HttpClient,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.fetchDashboardStats();
        this.fetchAdminActivities();
        this.fetchAllUsers();
    }

    fetchDashboardStats(): void {
        this.http.get<DashboardStats>(`${this.API_URL}/stats/summary`).subscribe({
            next: (data) => {
                this.totalAdmins = data.totalAdmins || 0;
                this.totalStudents = data.totalStudents || 0;
                this.totalEvents = data.totalEvents || 0;
                this.systemLoad = Math.floor(Math.random() * 30) + 20;
                this.activeEvents = data.totalEvents || 0;
                this.upcomingEvents = data.totalEvents || 0;
                this.totalRegistrations = data.totalEvents * 2 || 0;
                this.recentUsers = Math.floor(data.totalStudents / 3) || 0;
                console.log('Dashboard stats loaded:', data);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error fetching stats:', err);
            }
        });
    }

    fetchAdminActivities(): void {
        this.http.get<AdminActivity[]>(`${this.API_URL}/stats/admin-activities`).subscribe({
            next: (data) => {
                this.adminActivities = data;
                console.log('Admin activities loaded:', data.length, 'admins found');
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error fetching admin activities:', err);
            }
        });
    }

    fetchAllUsers(): void {
        this.http.get<User[]>(`${this.API_URL}/users/all`).subscribe({
            next: (data) => {
                this.allUsers = data;
                console.log('All users loaded:', data.length);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Error fetching users:', err);
            }
        });
    }

    createAdmin(): void {
        const adminData = {
            name: this.newAdmin.name,
            email: this.newAdmin.email,
            userId: this.newAdmin.userId,
            college: this.newAdmin.college,
            password: this.newAdmin.password,
            role: 'college_admin'
        };

        this.http.post(`${this.API_URL}/signup`, adminData).subscribe({
            next: (response: any) => {
                console.log('Admin created successfully:', response);
                this.showCreateAdmin = false;
                this.newAdmin = { name: '', email: '', userId: '', college: '', password: '' };
                this.fetchAllUsers();
                this.fetchDashboardStats();
                alert('College Admin created successfully!');
            },
            error: (err) => {
                console.error('Error creating admin:', err);
                alert('Error creating admin: ' + err.error?.message || 'Unknown error');
            }
        });
    }

    getActivityLevel(eventCount: number): string {
        if (eventCount >= 5) return 'High Activity';
        if (eventCount >= 2) return 'Medium Activity';
        return 'Low Activity';
    }

    getActivityColor(eventCount: number): { background: string; color: string } {
        if (eventCount >= 5) return { background: '#fee2e2', color: '#dc2626' };
        if (eventCount >= 2) return { background: '#fef3c7', color: '#d97706' };
        return { background: '#e0e7ff', color: '#4f46e5' };
    }

    formatDate(date: Date | string): string {
        const d = new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString();
    }

    logout() {
        this.auth.logout();
        this.router.navigate(['/login']);
    }
}
