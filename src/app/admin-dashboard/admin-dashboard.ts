import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';

type DashboardTab = 'overview' | 'events' | 'analytics';

interface OrganizerEvent {
  id: string;
  name: string;
  dateTime: string;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  status: 'Active' | 'Draft' | 'Past';
  registrations: number;
  participants: number;
  posterDataUrl?: string | null;
}

interface CreateEventForm {
  name: string;
  dateTime: string;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  posterDataUrl: string | null;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['./admin-dashboard.css']
})
export class AdminDashboard implements OnInit {

  private readonly API_URL = 'http://localhost:5000/api/events';
  constructor(private readonly http: HttpClient) {}
  activeTab: DashboardTab = 'overview';
  createModalOpen = false;

  events: OrganizerEvent[] = [];
  createForm: CreateEventForm = this.getEmptyCreateForm();

  ngOnInit(): void {
    this.fetchEvents();
  }

  setTab(tab: DashboardTab): void {
    this.activeTab = tab;
  }

  openCreateModal(): void {
    this.createModalOpen = true;
  }

  closeCreateModal(): void {
    this.createModalOpen = false;
    this.resetCreateForm();
  }

  onPosterSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.createForm.posterDataUrl = null;
      alert('Please choose an image file (JPG/PNG).');
      input.value = '';
      return;
    }

    const maxSizeBytes = 1.5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.createForm.posterDataUrl = null;
      alert('Please choose an image smaller than ~1.5MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.createForm.posterDataUrl = typeof reader.result === 'string' ? reader.result : null;
    };
    reader.onerror = () => {
      this.createForm.posterDataUrl = null;
      alert('Could not read that image file.');
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removePoster(): void {
    this.createForm.posterDataUrl = null;
  }

  fetchEvents(): void {
    this.http.get<OrganizerEvent[]>(this.API_URL).subscribe({
      next: (data) => {
        this.events = data;
        this.refreshEventStatuses();
      },
      error: (err) => {
        console.error('Error fetching events', err);
      }
    });
  }

  saveEvent(): void {
    const name = this.createForm.name.trim();
    if (!name || !this.createForm.dateTime.trim() || !this.createForm.location.trim()) {
      alert('Please fill Event Name, Date, and Location.');
      return;
    }

    const payload = {
      name,
      dateTime: this.createForm.dateTime,
      location: this.createForm.location.trim(),
      organizer: this.createForm.organizer.trim(),
      contact: this.createForm.contact.trim(),
      description: this.createForm.description.trim(),
      posterDataUrl: this.createForm.posterDataUrl,
      status: this.isPastEventDate(this.createForm.dateTime) ? 'Past' : 'Active',
      registrations: 0,
      participants: 0
    };

    this.http.post<OrganizerEvent>(this.API_URL, payload).subscribe({
      next: (savedEvent) => {
        this.events = [savedEvent, ...this.events];

        this.createModalOpen = false;
        this.resetCreateForm();
        this.activeTab = 'events';
      },
      error: (err) => {
        console.error('Error saving event', err);
        const message = err?.error?.error ?? err?.error?.message ?? 'Could not save event. Please try again.';
        alert(message);
      }
    });
  }

  deleteEvent(event: OrganizerEvent): void {
    const ok = window.confirm(`Delete "${event.name}"? This can't be undone.`);
    if (!ok) return;

    this.http.delete<void>(`${this.API_URL}/${event.id}`).subscribe({
      next: () => {
        this.events = this.events.filter((e) => e.id !== event.id);
      },
      error: (err) => {
        console.error('Error deleting event', err);
        alert('Could not delete event. Please try again.');
      }
    });
  }

  exportEvents(): void {
    this.refreshEventStatuses();
    if (this.events.length === 0) {
      alert('No events to export yet.');
      return;
    }

    const rows = [
      ['Event Name', 'Date', 'Location', 'Organizer', 'Contact', 'Status', 'Registrations', 'Participants'],
      ...this.events.map((e) => [
        e.name,
        this.formatDateTime(e.dateTime),
        e.location,
        e.organizer,
        e.contact,
        e.status,
        String(e.registrations),
        String(e.participants)
      ])
    ];

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'events.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  formatDateTime(value: string): string {
    if (!value) return '';
    const date = this.parseLocalDay(value);
    if (!date) return value;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }

  trackByEventId(_index: number, event: OrganizerEvent): string {
    return event.id;
  }

  get totalEventsCount(): number {
    return this.events.length;
  }

  get activeEvents(): number {
    return this.events.filter((e) => e.status === 'Active').length;
  }

  get totalRegistrations(): number {
    return this.events.reduce((sum, e) => sum + e.registrations, 0);
  }

  get averageParticipants(): number {
    if (this.events.length === 0) return 0;
    const total = this.events.reduce((sum, e) => sum + e.participants, 0);
    return Math.round(total / this.events.length);
  }

  private refreshEventStatuses(): void {
    const today = this.startOfToday();
    this.events = this.events.map((event) => {
      if (event.status === 'Draft') return event;
      const day = this.parseLocalDay(event.dateTime);
      if (!day) return event;

      const nextStatus: OrganizerEvent['status'] = day.getTime() < today.getTime() ? 'Past' : 'Active';
      if (event.status === nextStatus) return event;
      return { ...event, status: nextStatus };
    });
  }

  private isPastEventDate(value: string): boolean {
    const day = this.parseLocalDay(value);
    if (!day) return false;
    return day.getTime() < this.startOfToday().getTime();
  }

  private startOfToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private parseLocalDay(value: string): Date | null {
    const trimmed = value.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const monthIndex = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const local = new Date(year, monthIndex, day);
      return Number.isNaN(local.getTime()) ? null : local;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private resetCreateForm(): void {
    this.createForm = this.getEmptyCreateForm();
  }

  private getEmptyCreateForm(): CreateEventForm {
    return {
      name: '',
      dateTime: '',
      location: '',
      organizer: '',
      contact: '',
      description: '',
      posterDataUrl: null
    };
  }
}
