import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EventService } from '../event.service';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.css']
})
export class EventsComponent {
  events: any[] = [];
  newEvent = { name: '', date: '', location: '', description: '', organizer: '', contact: '' };
  showForm = false;
  editIndex: number | null = null;

  constructor(private eventService: EventService) {
    
    this.events = this.eventService.getEvents();
  }

  addEvent() {
    this.showForm = true;
    this.editIndex = null;
    this.newEvent = { name: '', date: '', location: '', description: '', organizer: '', contact: '' };
  }

  saveEvent() {
    if (this.editIndex !== null) {
      this.eventService.updateEvent(this.editIndex, { ...this.newEvent });
    } else {
      this.eventService.addEvent({ ...this.newEvent });
    }
    this.showForm = false;
    this.editIndex = null;
    this.events = this.eventService.getEvents(); 
  }

  editEvent(event: any, index: number) {
    this.showForm = true;
    this.editIndex = index;
    this.newEvent = { ...event };
  }

  deleteEvent(index: number) {
    this.eventService.deleteEvent(index);
    this.events = this.eventService.getEvents(); 
  }
}
