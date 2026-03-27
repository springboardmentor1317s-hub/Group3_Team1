import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { EventService, BackendEvent } from '../services/event.service';
import { finalize, timeout } from 'rxjs';

export interface CreateEventForm {
  name: string;
  collegeName: string;
  dateTime: string;
  endDate: string;
  registrationDeadline: string;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  teamSize: number | null;
  maxAttendees: number | null;
  posterDataUrl: string | null;
  category: string;
}



@Component({
  selector: 'app-create-event',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-event.component.html',
  styleUrls: ['./create-event.component.css']
})
export class CreateEventComponent implements OnInit {
  @Input() visible = false;
  @Input() editingEvent: BackendEvent | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
@Output() eventSaved = new EventEmitter<BackendEvent>();
  @Output() eventDeleted = new EventEmitter<BackendEvent>();

  isEditMode = false;
  isSavingEvent = false;
  createForm: CreateEventForm = this.getEmptyCreateForm();

  constructor(
    private readonly eventService: EventService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {}

  ngOnChanges(): void {
    if (this.visible) {
      this.isEditMode = !!this.editingEvent;
      if (this.editingEvent) {
        this.createForm = {
          name: this.editingEvent.name ?? '',
          collegeName: this.editingEvent.collegeName ?? '',
          dateTime: this.editingEvent.dateTime ?? '',
          endDate: this.editingEvent.endDate ?? '',
          registrationDeadline: this.editingEvent.registrationDeadline ?? '',
          location: this.editingEvent.location ?? '',
          organizer: this.editingEvent.organizer ?? '',
          contact: this.editingEvent.contact ?? '',
          description: this.editingEvent.description ?? '',
          teamSize: this.editingEvent.teamSize ?? null,
          maxAttendees: this.editingEvent.maxAttendees ?? null,
          posterDataUrl: this.editingEvent.posterDataUrl ?? null,
          category: this.editingEvent.category ?? ''
        };
      } else {
        this.resetCreateForm();
      }
    }
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
      this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  saveEvent(form?: NgForm): void {
    if (this.isSavingEvent) return;

    form?.control.markAllAsTouched();

    const name = this.createForm.name.trim();
    const category = this.createForm.category.trim();
    const dateTime = this.createForm.dateTime.trim();
    const location = this.createForm.location.trim();

    if (!name || !category || !dateTime || !location || form?.invalid) {
      alert('Please fill all required fields before saving the event.');
      return;
    }

    const payload: any = {
      name,
      collegeName: this.createForm.collegeName.trim(),
      dateTime,
      endDate: this.createForm.endDate.trim() || null,
      registrationDeadline: this.createForm.registrationDeadline.trim() || "",
      location,
      organizer: this.createForm.organizer.trim(),
      contact: this.createForm.contact.trim(),
      description: this.createForm.description.trim(),
      teamSize: this.createForm.teamSize ?? null,
      maxAttendees: this.createForm.maxAttendees ?? null,
      posterDataUrl: this.createForm.posterDataUrl,
      category,
      status: 'Active',
      registrations: this.editingEvent?.registrations ?? 0,
      participants: this.editingEvent?.participants ?? 0
    };

    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const creatorId = currentUser?.userId || currentUser?.id || currentUser?._id || '';
    const creatorName = currentUser?.name || '';
    const creatorEmail = currentUser?.email || '';
    const creatorCollege = currentUser?.college || '';

    payload.collegeName = payload.collegeName || creatorCollege;
    payload.createdBy = creatorName;
    payload.createdById = creatorId;
    payload.ownerId = creatorId;
    payload.adminId = creatorId;
    payload.userId = creatorId;
    payload.email = creatorEmail;

    this.isSavingEvent = true;
    
    const request = this.isEditMode && this.editingEvent 
      ? this.eventService.updateEvent(this.editingEvent.id, payload)
      : this.eventService.createEvent(payload);

    request.pipe(
      timeout(8000),
      finalize(() => {
        this.isSavingEvent = false;
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: (savedEvent: BackendEvent) => {
        this.eventSaved.emit(savedEvent);
        this.close();
      },
      error: (err: any) => {
        console.error('Error saving event', err);
        const message = err?.name === 'TimeoutError'
          ? 'Save timed out. Please check the server and try again.'
          : 'Could not save event. Please try again.';
        alert(message);
      }
    });
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.resetCreateForm();
  }

  private resetCreateForm(): void {
    this.createForm = this.getEmptyCreateForm();
  }

  private getEmptyCreateForm(): CreateEventForm {
    return {
      name: '',
      collegeName: '',
      dateTime: '',
      endDate: '',
      registrationDeadline: '',
      location: '',
      organizer: '',
      contact: '',
      description: '',
      teamSize: null,
      maxAttendees: null,
      posterDataUrl: null,
      category: ''
    };
  }
}

