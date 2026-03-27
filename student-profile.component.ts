import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';

interface StudentProfile {
  name: string;
  email: string;
  phone: string;
  college: string;
  studentId: string;
  department: string;
  year: string;
  bio: string;
  profileImageUrl?: string | null;
}

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-profile.component.html',
  styleUrls: ['./student-profile.component.css']
})
export class StudentProfilePageComponent implements OnInit {
  profile: StudentProfile = {
    name: '',
    email: '',
    phone: '',
    college: '',
    studentId: '',
    department: '',
    year: '',
    bio: '',
    profileImageUrl: null
  };

  isLoading = false;
  isSaving = false;

  // Toast Notification State
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  private readonly API_URL = '/api/student/profile';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.hydrateFromLocalStorage();
    this.fetchProfile();
  }

  hydrateFromLocalStorage() {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (user) {
      this.profile = { ...this.profile, ...user };
    }
  }

  fetchProfile() {
    this.isLoading = true;
    const headers = this.getAuthHeaders();
    this.http.get<StudentProfile>(this.API_URL, { headers }).subscribe({
      next: (data) => {
        this.profile = { ...this.profile, ...data };
        this.updateLocalStorage(this.profile);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load profile', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

saveProfile() {
  if (this.isSaving) return;

  if (!this.profile.name || !this.profile.email) {
    this.showErrorToast('Name and Email are required.');
    return;
  }

  this.isSaving = true;

  // 🔥 Optimistic UI update (instant feel)
  const previousProfile = { ...this.profile };
  this.updateLocalStorage(this.profile);

  const headers = this.getAuthHeaders();

  this.http.put<StudentProfile>(this.API_URL, this.profile, { headers }).subscribe({
    next: (updatedProfile) => {
      this.profile = { ...updatedProfile }; // ✅ Use server data fully
      this.updateLocalStorage(this.profile);

      this.showSuccessToast('Profile updated successfully!');
      this.isSaving = false;
    },
    error: (err) => {
      console.error('Error saving profile:', err);

      // 🔥 Rollback if failed
      this.profile = previousProfile;
      this.updateLocalStorage(previousProfile);

      this.showErrorToast('Failed to save. Try again.');
      this.isSaving = false;
    }
  });
}

  updateLocalStorage(data: StudentProfile) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const updatedUser = { ...currentUser, ...data };
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    if (data.name) localStorage.setItem('userName', data.name);
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  private showSuccessToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'success';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
      this.cdr.detectChanges();
    }, 3000);
  }

  private showErrorToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'error';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
      this.cdr.detectChanges();
    }, 3000);
  }
}