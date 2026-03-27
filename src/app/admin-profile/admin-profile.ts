import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { buildAdminProfileIdentifiers, filterEventsOwnedByAdmin } from '../shared/admin-owned-events.util';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './admin-profile.html',
  styleUrls: ['./admin-profile.css']
})
export class AdminProfile implements OnInit {
  private readonly PROFILE_API = '/api/profile/me';
  private readonly EVENTS_API = '/api/events';

  userName = 'College Admin';
  email = 'admin@college.edu';
  college = 'CampusEventHub University';
  role = 'College Admin';
  phone = '+91 90000 00000';
  location = 'Main Campus, India';
  joinedOn = 'Mar 2025';
  department = 'Student Affairs';
  profileImageUrl: string | null = null;

  isEditing = false;
  isSaving = false;
  isLoading = false;
  isStatsLoading = false;
  eventsManaged = 0;
  activeEvents = 0;
  avgResponseTime = '—';
  editForm = this.getEmptyForm();
  private profileIdentifiers: string[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.hydrateFromLocalStorage();
    this.fetchProfile();
    this.fetchEventStats();
  }

  startEdit(): void {
    this.isEditing = true;
    this.resetEditForm();
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.resetEditForm();
  }

  saveProfile(): void {
    this.isSaving = true;
    const payload = {
      name: this.editForm.userName.trim(),
      email: this.editForm.email.trim(),
      phone: this.editForm.phone.trim(),
      location: this.editForm.location.trim(),
      department: this.editForm.department.trim(),
      profileImageUrl: this.profileImageUrl
    };

    this.http.put<any>(this.PROFILE_API, payload, { headers: this.getAuthHeaders() }).subscribe({
      next: (profile) => {
        this.applyProfile(profile);
        this.isSaving = false;
        this.isEditing = false;
        this.persistToLocalStorage(profile);
      },
      error: (err) => {
        console.error('Profile update failed', err);
        this.isSaving = false;
        alert(err?.error?.message || 'Could not update profile.');
      }
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPG/PNG).');
      input.value = '';
      return;
    }

    const maxSizeBytes = 1.5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert('Please choose an image smaller than ~1.5MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.profileImageUrl = typeof reader.result === 'string' ? reader.result : null;
    };
    reader.onerror = () => {
      alert('Could not read that image file.');
    };
    reader.readAsDataURL(file);
  }

  private fetchProfile(): void {
    this.isLoading = true;
    this.http.get<any>(this.PROFILE_API, { headers: this.getAuthHeaders() }).subscribe({
      next: (profile) => {
        this.applyProfile(profile);
        this.persistToLocalStorage(profile);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Profile fetch failed', err);
        this.isLoading = false;
        this.hydrateFromLocalStorage();
        if (!this.userName || !this.email) {
          alert(err?.error?.message || 'Could not load profile.');
        }
        this.cdr.detectChanges();
      }
    });
  }

  private fetchEventStats(): void {
    this.isStatsLoading = true;
    this.http.get<any[]>(this.EVENTS_API, { headers: this.getAuthHeaders() }).subscribe({
      next: (events) => {
        const list = Array.isArray(events) ? events : [];
        const ownedEvents = this.filterEventsForCurrentAdmin(list);
        this.eventsManaged = ownedEvents.length;
        this.activeEvents = list.length;
        this.isStatsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Event stats fetch failed', err);
        this.isStatsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private filterEventsForCurrentAdmin(events: any[]): any[] {
    return filterEventsOwnedByAdmin(events, this.profileIdentifiers);
  }

  private buildProfileIdentifiers(source?: any): string[] {
    const base = source ?? {
      name: this.userName,
      email: this.email,
      id: (source as any)?.id,
      userId: (source as any)?.userId
    };
    return buildAdminProfileIdentifiers(base);
  }

  private applyProfile(profile: any): void {
    this.userName = profile?.name || this.userName;
    this.email = profile?.email || this.email;
    this.college = profile?.college || this.college;
    this.role = profile?.role || this.role;
    this.phone = profile?.phone || this.phone;
    this.location = profile?.location || this.location;
    this.department = profile?.department || this.department;
    this.profileImageUrl = profile?.profileImageUrl || null;
    this.profileIdentifiers = this.buildProfileIdentifiers(profile);
    this.resetEditForm();
    this.fetchEventStats();
  }

  private persistToLocalStorage(profile: any): void {
    const existing = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const merged = {
      ...existing,
      name: profile?.name ?? existing.name,
      email: profile?.email ?? existing.email,
      college: profile?.college ?? existing.college,
      role: profile?.role ?? existing.role,
      phone: profile?.phone ?? existing.phone,
      location: profile?.location ?? existing.location,
      department: profile?.department ?? existing.department,
      profileImageUrl: profile?.profileImageUrl ?? existing.profileImageUrl
    };
    localStorage.setItem('currentUser', JSON.stringify(merged));
  }

  private hydrateFromLocalStorage(): void {
    const cached = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!cached || Object.keys(cached).length === 0) return;
    this.userName = cached.name || this.userName;
    this.email = cached.email || this.email;
    this.college = cached.college || this.college;
    this.role = cached.role || this.role;
    this.phone = cached.phone || this.phone;
    this.location = cached.location || this.location;
    this.department = cached.department || this.department;
    this.profileImageUrl = cached.profileImageUrl || this.profileImageUrl;
    this.profileIdentifiers = this.buildProfileIdentifiers(cached);
    this.resetEditForm();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private resetEditForm(): void {
    this.editForm = {
      userName: this.userName,
      email: this.email,
      phone: this.phone,
      location: this.location,
      department: this.department
    };
  }

  private getEmptyForm(): {
    userName: string;
    email: string;
    phone: string;
    location: string;
    department: string;
  } {
    return {
      userName: '',
      email: '',
      phone: '',
      location: '',
      department: ''
    };
  }
}
