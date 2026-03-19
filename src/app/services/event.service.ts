import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface BackendEvent {
  id: string;
  name: string;
  dateTime: string;
  endDate?: string | null;
  teamSize?: number | null;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  category?: string;
  posterDataUrl: string | null;
  status: 'Active' | 'Draft' | 'Past';
  registrations: number;
  participants: number;
  maxAttendees?: number;
  attendeeIds?: string[];
  registered?: boolean;
  collegeName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private apiUrl = '/api';
  private eventsSubject = new BehaviorSubject<BackendEvent[]>([]);
  public events$ = this.eventsSubject.asObservable();

  private registrationsSubject = new BehaviorSubject<string[]>([]);
  public registrations$ = this.registrationsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.loadRegistrations();
  }

  fetchEvents(): Observable<BackendEvent[]> {
    const headers = this.authService.getAuthHeaders();
    return this.http.get<BackendEvent[]>(`${this.apiUrl}/events`, { headers }).pipe(
      tap((events) => {
        this.eventsSubject.next(events);
        const registeredIds = events
          .filter((event) => event.registered === true)
          .map((event) => String(event.id));
        this.saveRegistrations(registeredIds);
      })
    );
  }

  getEventById(id: string): Observable<BackendEvent | undefined> {
    return this.events$.pipe(map((events) => events.find((e) => e.id === id)));
  }

  createEvent(event: Partial<BackendEvent>): Observable<BackendEvent> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<BackendEvent>(`${this.apiUrl}/events`, event, { headers }).pipe(
      tap((newEvent) => {
        const currentEvents = this.eventsSubject.value;
        this.eventsSubject.next([newEvent, ...currentEvents]);
      })
    );
  }

  updateEvent(id: string, event: Partial<BackendEvent>): Observable<BackendEvent> {
    const headers = this.authService.getAuthHeaders();
    return this.http.put<BackendEvent>(`${this.apiUrl}/events/${id}`, event, { headers }).pipe(
      tap((updatedEvent) => {
        const currentEvents = this.eventsSubject.value;
        const index = currentEvents.findIndex(e => e.id === updatedEvent.id);
        if (index > -1) {
          const newEvents = [...currentEvents];
          newEvents[index] = updatedEvent;
          this.eventsSubject.next(newEvents);
        }
      })
    );
  }

  deleteEvent(id: string): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<void>(`${this.apiUrl}/events/${id}`, { headers }).pipe(
      tap(() => {
        const currentEvents = this.eventsSubject.value;
        this.eventsSubject.next(currentEvents.filter((e) => e.id !== id));
      })
    );
  }

  toggleRegistration(eventId: string): Observable<BackendEvent> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<BackendEvent>(`${this.apiUrl}/events/toggle/${eventId}`, {}, { headers }).pipe(
      tap((updatedEvent) => {
        const id = String(updatedEvent.id);
        const current = this.registrationsSubject.value;
        const next = updatedEvent.registered
          ? Array.from(new Set([...current, id]))
          : current.filter((eventIdValue) => eventIdValue !== id);
        this.saveRegistrations(next);

        const events = this.eventsSubject.value;
        const idx = events.findIndex((e) => String(e.id) === id);
        if (idx > -1) {
          const clone = [...events];
          clone[idx] = updatedEvent;
          this.eventsSubject.next(clone);
        }
      })
    );
  }

  private loadRegistrations(): void {
    const stored = localStorage.getItem('eventRegistrations');
    if (!stored) return;

    try {
      const registrations = JSON.parse(stored);
      if (Array.isArray(registrations)) {
        this.registrationsSubject.next(registrations.map((id) => String(id)));
      }
    } catch (e) {
      console.error('Error loading registrations:', e);
    }
  }

  private saveRegistrations(registrations: string[]): void {
    localStorage.setItem('eventRegistrations', JSON.stringify(registrations));
    this.registrationsSubject.next(registrations);
  }

  registerForEvent(eventId: string): void {
    const currentRegistrations = this.registrationsSubject.value;
    if (!currentRegistrations.includes(eventId)) {
      this.saveRegistrations([...currentRegistrations, eventId]);
    }
  }

  unregisterFromEvent(eventId: string): void {
    const currentRegistrations = this.registrationsSubject.value;
    this.saveRegistrations(currentRegistrations.filter((id) => id !== eventId));
  }

  isRegisteredForEvent(eventId: string): boolean {
    return this.registrationsSubject.value.includes(eventId);
  }

  getRegisteredEvents(): Observable<BackendEvent[]> {
    return this.events$.pipe(
      map((events) => {
        const registeredIds = this.registrationsSubject.value;
        return events.filter((e) => registeredIds.includes(e.id));
      })
    );
  }

  getCurrentRegistrations(): string[] {
    return this.registrationsSubject.value;
  }

  convertToFrontendEvent(backendEvent: BackendEvent): any {
    const dateObj = backendEvent.dateTime ? new Date(backendEvent.dateTime) : null;
    const isRegistered = backendEvent.registered === true;
    const isFull = (backendEvent.registrations || 0) >= (backendEvent.maxAttendees || backendEvent.participants || 100);

    let status: 'Open' | 'Registered' | 'Full' | 'Closed' = 'Open';
    if (backendEvent.status === 'Past') {
      status = 'Closed';
    } else if (isRegistered) {
      status = 'Registered';
    } else if (isFull) {
      status = 'Full';
    }

    return {
      id: backendEvent.id,
      title: backendEvent.name,
      date: dateObj ? dateObj.toISOString().split('T')[0] : '',
      time: dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      location: backendEvent.location,
      category: backendEvent.category || this.determineCategory(backendEvent.name, backendEvent.description || ''),
      attendees: backendEvent.registrations || 0,
      maxAttendees: backendEvent.maxAttendees || backendEvent.participants || 100,
      status,
      description: backendEvent.description,
      registered: isRegistered,
      organizer: backendEvent.organizer,
      contact: backendEvent.contact,
      posterUrl: backendEvent.posterDataUrl,
      college: backendEvent.collegeName
    };
  }

  private determineCategory(name: string, description: string): string {
    const text = `${name} ${description}`.toLowerCase();

    if (text.includes('tech') || text.includes('coding') || text.includes('hackathon') || text.includes('ai') || text.includes('ml') || text.includes('programming')) {
      return 'Technology';
    }
    if (text.includes('workshop') || text.includes('training')) {
      return 'Workshop';
    }
    if (text.includes('career') || text.includes('job') || text.includes('placement')) {
      return 'Career';
    }
    if (text.includes('sports') || text.includes('game') || text.includes('tournament')) {
      return 'Sports';
    }
    if (text.includes('cultural') || text.includes('fest') || text.includes('music') || text.includes('dance') || text.includes('art')) {
      return 'Cultural';
    }
    if (text.includes('seminar') || text.includes('conference') || text.includes('talk')) {
      return 'Seminar';
    }

    return 'Seminar';
  }
}
