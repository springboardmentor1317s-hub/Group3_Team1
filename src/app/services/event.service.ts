import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

// Configure your backend API URL here
const API_URL = 'http://localhost:5000/api';

export interface BackendEvent {
  id: string;
  name: string;
  dateTime: string;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  posterDataUrl: string | null;
  status: 'Active' | 'Draft' | 'Past';
  registrations: number;
  participants: number;
}

export interface EventRegistration {
  eventId: string;
  userId: string;
  registeredAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private apiUrl = API_URL;
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

  // Fetch all events from backend
  fetchEvents(): Observable<BackendEvent[]> {
    return this.http.get<BackendEvent[]>(`${this.apiUrl}/events`)
      .pipe(
        tap(events => {
          this.eventsSubject.next(events);
        })
      );
  }

  // Get single event by ID
  getEventById(id: string): Observable<BackendEvent | undefined> {
    return this.events$.pipe(
      map(events => events.find(e => e.id === id))
    );
  }

  // Create new event
  createEvent(event: Partial<BackendEvent>): Observable<BackendEvent> {
    const headers = this.authService.getAuthHeaders();
    return this.http.post<BackendEvent>(`${this.apiUrl}/events`, event, { headers })
      .pipe(
        tap(newEvent => {
          const currentEvents = this.eventsSubject.value;
          this.eventsSubject.next([newEvent, ...currentEvents]);
        })
      );
  }

  // Delete event
  deleteEvent(id: string): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<void>(`${this.apiUrl}/events/${id}`, { headers })
      .pipe(
        tap(() => {
          const currentEvents = this.eventsSubject.value;
          this.eventsSubject.next(currentEvents.filter(e => e.id !== id));
        })
      );
  }

  // Local registration management (store in localStorage)
  private loadRegistrations(): void {
    const stored = localStorage.getItem('eventRegistrations');
    if (stored) {
      try {
        const registrations = JSON.parse(stored);
        this.registrationsSubject.next(registrations);
      } catch (e) {
        console.error('Error loading registrations:', e);
      }
    }
  }

  private saveRegistrations(registrations: string[]): void {
    localStorage.setItem('eventRegistrations', JSON.stringify(registrations));
    this.registrationsSubject.next(registrations);
  }

  registerForEvent(eventId: string): void {
    const currentRegistrations = this.registrationsSubject.value;
    if (!currentRegistrations.includes(eventId)) {
      const updated = [...currentRegistrations, eventId];
      this.saveRegistrations(updated);
    }
  }

  unregisterFromEvent(eventId: string): void {
    const currentRegistrations = this.registrationsSubject.value;
    const updated = currentRegistrations.filter(id => id !== eventId);
    this.saveRegistrations(updated);
  }

  isRegisteredForEvent(eventId: string): boolean {
    return this.registrationsSubject.value.includes(eventId);
  }

  getRegisteredEvents(): Observable<BackendEvent[]> {
    return this.events$.pipe(
      map(events => {
        const registeredIds = this.registrationsSubject.value;
        return events.filter(e => registeredIds.includes(e.id));
      })
    );
  }

  getCurrentRegistrations(): string[] {
    return this.registrationsSubject.value;
  }

  // Convert backend event to frontend Event format
  convertToFrontendEvent(backendEvent: BackendEvent): any {
    // Parse dateTime - handle both formats: "2026-03-01" or "2026-03-01T14:00:00"
    let dateTime: Date;
    let dateStr: string;
    let timeStr: string;
    
 
  if (backendEvent.dateTime.includes('T')) {
  const [datePart, timePart] = backendEvent.dateTime.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  dateTime = new Date(year, month - 1, day, hour, minute);
  dateStr = datePart;
  timeStr = dateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
} else {
  const [year, month, day] = backendEvent.dateTime.split('-').map(Number);
  dateTime = new Date(year, month - 1, day, 12, 0); // noon to avoid timezone drift
  dateStr = backendEvent.dateTime;
  timeStr = '12:00 PM';
}


    // Determine category from name/description
    const category = this.determineCategory(backendEvent.name, backendEvent.description);
    
    // Determine status
    const isRegistered = this.isRegisteredForEvent(backendEvent.id);
    let status: 'Open' | 'Registered' | 'Full' | 'Closed';
    
    if (backendEvent.status === 'Past') {
      status = 'Closed';
    } else if (isRegistered) {
      status = 'Registered';
    } else if (backendEvent.registrations >= backendEvent.participants && backendEvent.participants > 0) {
      status = 'Full';
    } else {
      status = 'Open';
    }

    return {
      id: parseInt(backendEvent.id.slice(-6), 16) || Math.floor(Math.random() * 10000),
      title: backendEvent.name,
      date: dateStr,
      time: timeStr,
      location: backendEvent.location,
      category: category,
      attendees: backendEvent.registrations,
      maxAttendees: backendEvent.participants || 100,
      status: status,
      description: backendEvent.description,
      registered: isRegistered,
      organizer: backendEvent.organizer,
      contact: backendEvent.contact,
      posterUrl: backendEvent.posterDataUrl
    };
  }

  private determineCategory(name: string, description: string): string {
    const text = (name + ' ' + description).toLowerCase();
    
    if (text.includes('tech') || text.includes('coding') || text.includes('hackathon') || 
        text.includes('ai') || text.includes('ml') || text.includes('programming')) {
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
    if (text.includes('cultural') || text.includes('fest') || text.includes('music') || 
        text.includes('dance') || text.includes('art')) {
      return 'Cultural';
    }
    if (text.includes('seminar') || text.includes('conference') || text.includes('talk')) {
      return 'Seminar';
    }
    
    return 'Seminar';
  }
}