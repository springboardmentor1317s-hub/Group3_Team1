import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EventService {
  private events: any[] = [];

  getEvents() {
    return this.events;
  }

  addEvent(event: any) {
    this.events.push(event);
  }

  updateEvent(index: number, event: any) {
    if (index >= 0 && index < this.events.length) {
      this.events[index] = event;
    }
  }

  deleteEvent(index: number) {
    if (index >= 0 && index < this.events.length) {
      this.events.splice(index, 1);
    }
  }
}

