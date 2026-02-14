

import { Component, Input, Output, EventEmitter } from '@angular/core';
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

  
  @Input() visible = false;
  @Output() close = new EventEmitter<void>();

  closeForm() {
    this.visible = false;
    this.close.emit();
  }

  

  events: any[] = [];
  editIndex: number | null = null;

  newEvent = {
    name: '',
    date: '',
    location: '',
    description: '',
    organizer: '',
    contact: ''
  };

  constructor(private eventService: EventService) {
    this.loadEvents();
  }

  loadEvents() {
    this.events = this.eventService.getEvents();
  }

  
  saveEvent() {

    if (!this.newEvent.name || !this.newEvent.date) return;

    if (this.editIndex !== null) {
      this.eventService.updateEvent(this.editIndex, { ...this.newEvent });
    } else {
      this.eventService.addEvent({ ...this.newEvent });
    }

    this.resetForm();
    this.loadEvents();
    this.closeForm(); // CLOSE POPUP AFTER SAVE
  }

  
  editEvent(event: any, index: number) {
    this.visible = true;
    this.editIndex = index;
    this.newEvent = { ...event };
  }

  deleteEvent(index: number) {
    this.eventService.deleteEvent(index);
    this.loadEvents();
  }

  resetForm() {
    this.editIndex = null;
    this.newEvent = {
      name: '',
      date: '',
      location: '',
      description: '',
      organizer: '',
      contact: ''
    };
  }
}

