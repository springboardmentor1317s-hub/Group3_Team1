import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { EventService, BackendEvent } from '../services/event.service';
import { finalize, timeout } from 'rxjs';

export interface CreateEventForm {
  name: string;
  collegeName: string;
  dateTime: string;
  startTime: string;
  endDate: string;
  registrationDeadline: string;
  location: string;
  organizer: string;
  contact: string;
  description: string;
  teamSize: number | null;
  maxAttendees: number | null;
  isPaid: boolean;
  amount: number | null;
  currency: string;
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
export class CreateEventComponent implements OnInit, OnChanges {
  @Input() visible = false;
  @Input() editingEvent: BackendEvent | null = null;
  @Input() mode: 'modal' | 'page' = 'modal';

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() eventSaved = new EventEmitter<BackendEvent>();
  @Output() eventDeleted = new EventEmitter<BackendEvent>();
  @Output() cancelRequested = new EventEmitter<void>();

  isEditMode = false;
  isSavingEvent = false;
  adminCollegeName = '';
  createForm: CreateEventForm = this.getEmptyCreateForm();

  constructor(
    private readonly eventService: EventService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeFormState();
  }

  get isPageMode(): boolean {
    return this.mode === 'page';
  }

  get isOpen(): boolean {
    return this.isPageMode || this.visible;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.initializeFormState();
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
    const startDate = this.createForm.dateTime.trim();
    const startTime = this.createForm.startTime.trim();
    const location = this.createForm.location.trim();

    if (!name || !category || !startDate || !startTime || !location || form?.invalid) {
      alert('Please fill all required fields before saving the event.');
      return;
    }

    const dateTime = this.combineDateAndTime(startDate, startTime);
    if (!dateTime) {
      alert('Please enter a valid event start date and time.');
      return;
    }

    const payload: any = {
      name,
      collegeName: this.getLockedCollegeName(),
      dateTime,
      endDate: this.createForm.endDate.trim() || null,
      registrationDeadline: this.createForm.registrationDeadline.trim() || "",
      location,
      organizer: this.createForm.organizer.trim(),
      contact: this.createForm.contact.trim(),
      description: this.createForm.description.trim(),
      teamSize: this.createForm.teamSize ?? null,
      maxAttendees: this.createForm.maxAttendees ?? null,
      isPaid: Boolean(this.createForm.isPaid),
      amount: this.createForm.isPaid ? (this.createForm.amount ?? 0) : 0,
      currency: String(this.createForm.currency || 'INR').trim() || 'INR',
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
    const creatorCollege = this.resolveAdminCollegeName();

    payload.collegeName = creatorCollege || payload.collegeName;
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
        if (this.isPageMode) {
          this.resetCreateForm();
          return;
        }
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
    if (this.isPageMode) {
      this.cancelRequested.emit();
      return;
    }
    this.visible = false;
    this.visibleChange.emit(false);
    this.resetCreateForm();
  }

  private resetCreateForm(): void {
    this.createForm = this.getEmptyCreateForm();
    this.applyAdminCollegeName();
  }

  private initializeFormState(): void {
    if (!this.isOpen) {
      return;
    }

    this.isEditMode = !!this.editingEvent;
    this.adminCollegeName = this.resolveAdminCollegeName();

    if (this.editingEvent) {
      this.createForm = this.buildFormFromEvent(this.editingEvent);
      this.applyAdminCollegeName();
      this.cdr.detectChanges();
      return;
    }

    this.resetCreateForm();
    this.cdr.detectChanges();
  }

  private buildFormFromEvent(event: BackendEvent): CreateEventForm {
    return {
      name: event.name ?? '',
      collegeName: this.adminCollegeName || event.collegeName || '',
      dateTime: this.extractDateInputValue(event.dateTime),
      startTime: this.extractTimeInputValue(event.dateTime),
      endDate: this.normalizeDateInputValue(event.endDate),
      registrationDeadline: this.normalizeDateInputValue(event.registrationDeadline),
      location: event.location ?? '',
      organizer: event.organizer ?? '',
      contact: event.contact ?? '',
      description: event.description ?? '',
      teamSize: event.teamSize ?? null,
      maxAttendees: event.maxAttendees ?? null,
      isPaid: event.isPaid === true,
      amount: typeof event.amount === 'number' ? event.amount : null,
      currency: event.currency || 'INR',
      posterDataUrl: event.posterDataUrl ?? null,
      category: event.category ?? ''
    };
  }

  private normalizeDateInputValue(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (dateOnlyMatch) {
      return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private extractDateInputValue(value: string | null | undefined): string {
    return this.normalizeDateInputValue(value);
  }

  private extractTimeInputValue(value: string | null | undefined): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    const timeMatch = /T(\d{2}):(\d{2})/.exec(raw);
    if (timeMatch) {
      return `${timeMatch[1]}:${timeMatch[2]}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private combineDateAndTime(dateValue: string, timeValue: string): string {
    const normalizedDate = String(dateValue || '').trim();
    const normalizedTime = String(timeValue || '').trim();
    if (!normalizedDate || !normalizedTime) {
      return '';
    }

    const combined = `${normalizedDate}T${normalizedTime}`;
    const parsed = new Date(combined);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    return combined;
  }

  private getEmptyCreateForm(): CreateEventForm {
    return {
      name: '',
      collegeName: '',
      dateTime: '',
      startTime: '',
      endDate: '',
      registrationDeadline: '',
      location: '',
      organizer: '',
      contact: '',
      description: '',
      teamSize: null,
      maxAttendees: null,
      isPaid: false,
      amount: null,
      currency: 'INR',
      posterDataUrl: null,
      category: ''
    };
  }

  private applyAdminCollegeName(): void {
    const lockedCollegeName = this.getLockedCollegeName();
    this.createForm.collegeName = lockedCollegeName;
  }

  private getLockedCollegeName(): string {
    return (this.adminCollegeName || this.createForm.collegeName || '').trim();
  }

  private resolveAdminCollegeName(): string {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(
      currentUser?.college ||
      currentUser?.collegeName ||
      this.editingEvent?.collegeName ||
      ''
    ).trim();
  }
}

