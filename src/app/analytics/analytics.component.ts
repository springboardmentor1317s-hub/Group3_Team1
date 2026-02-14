import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventService } from '../event.service';

interface DashboardEvent {
  name: string;
  date: string;
  location?: string;
  description?: string;
  organizer?: string;
  contact?: string;
}

interface MonthStat {
  label: string;
  count: number;
  percent: number;
}

interface LocationStat {
  name: string;
  count: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit {
  events: DashboardEvent[] = [];
  sortedEvents: DashboardEvent[] = [];
  upcomingSchedule: DashboardEvent[] = [];

  totalEvents = 0;
  upcomingEvents = 0;
  completedEvents = 0;
  eventsThisMonth = 0;
  uniqueLocations = 0;
  uniqueOrganizers = 0;

  monthlyData: MonthStat[] = [];
  locationData: LocationStat[] = [];

  nextEvent: DashboardEvent | null = null;
  refreshedAt = new Date();

  constructor(private eventService: EventService) {}

  ngOnInit(): void {
    this.refreshAnalytics();
  }

  refreshAnalytics(): void {
    const rawEvents = this.eventService.getEvents() as DashboardEvent[];
    this.events = [...rawEvents];
    this.refreshedAt = new Date();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    this.totalEvents = this.events.length;
    this.upcomingEvents = this.events.filter((event) => {
      const eventDate = this.toValidDate(event.date);
      return eventDate !== null && eventDate >= now;
    }).length;

    this.completedEvents = this.events.filter((event) => {
      const eventDate = this.toValidDate(event.date);
      return eventDate !== null && eventDate < now;
    }).length;

    this.eventsThisMonth = this.events.filter((event) => {
      const eventDate = this.toValidDate(event.date);
      return (
        eventDate !== null &&
        eventDate.getMonth() === currentMonth &&
        eventDate.getFullYear() === currentYear
      );
    }).length;

    this.uniqueLocations = new Set(
      this.events
        .map((event) => (event.location ?? '').trim())
        .filter((location) => location.length > 0)
    ).size;

    this.uniqueOrganizers = new Set(
      this.events
        .map((event) => (event.organizer ?? '').trim())
        .filter((organizer) => organizer.length > 0)
    ).size;

    this.sortedEvents = [...this.events].sort((a, b) => {
      const dateA = this.toValidDate(a.date)?.getTime() ?? Number.POSITIVE_INFINITY;
      const dateB = this.toValidDate(b.date)?.getTime() ?? Number.POSITIVE_INFINITY;
      return dateA - dateB;
    });

    this.nextEvent = this.sortedEvents.find((event) => {
      const eventDate = this.toValidDate(event.date);
      return eventDate !== null && eventDate >= now;
    }) ?? null;
    this.upcomingSchedule = this.sortedEvents.filter((event) => {
      const eventDate = this.toValidDate(event.date);
      return eventDate !== null && eventDate >= now;
    });

    this.monthlyData = this.buildMonthlyData();
    this.locationData = this.buildLocationData();
  }

  trackByMonth(_: number, month: MonthStat): string {
    return month.label;
  }

  trackByLocation(_: number, location: LocationStat): string {
    return location.name;
  }

  toDisplayDate(date: string): string {
    const parsed = this.toValidDate(date);
    if (parsed === null) {
      return 'Date not set';
    }

    return parsed.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  get nextEventDays(): number {
    if (this.nextEvent === null) {
      return 0;
    }

    const eventDate = this.toValidDate(this.nextEvent.date);
    if (eventDate === null) {
      return 0;
    }

    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  private buildMonthlyData(): MonthStat[] {
    const monthSlots: { key: string; label: string }[] = [];
    const now = new Date();

    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
      const label = monthDate.toLocaleDateString('en-US', { month: 'short' });
      monthSlots.push({ key, label });
    }

    const counts = new Map<string, number>();
    this.events.forEach((event) => {
      const eventDate = this.toValidDate(event.date);
      if (eventDate === null) {
        return;
      }

      const key = `${eventDate.getFullYear()}-${eventDate.getMonth()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const values = monthSlots.map((slot) => counts.get(slot.key) ?? 0);
    const maxCount = Math.max(...values, 1);

    return monthSlots.map((slot) => {
      const count = counts.get(slot.key) ?? 0;
      return {
        label: slot.label,
        count,
        percent: (count / maxCount) * 100
      };
    });
  }

  private buildLocationData(): LocationStat[] {
    const locationCount = new Map<string, number>();

    this.events.forEach((event) => {
      const key = (event.location ?? '').trim() || 'Unspecified';
      locationCount.set(key, (locationCount.get(key) ?? 0) + 1);
    });

    return Array.from(locationCount.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private toValidDate(value: string): Date | null {
    if (!value || value.trim().length === 0) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
