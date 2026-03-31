import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

export interface AppNotification {
  id: string;
  userId: string;
  role: 'student' | 'admin';
  title: string;
  message: string;
  icon: string;
  tone: string;
  category: string;
  isSeen: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  unseenCount: number;
}

export interface DropdownNotificationState {
  items: AppNotification[];
  unseenCount: number;
  hasMore: boolean;
}

export interface NotificationQueryOptions {
  page?: number;
  limit?: number;
  unseenOnly?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly apiUrl = '/api/notifications';
  private cachedDropdownState: DropdownNotificationState = {
    items: [],
    unseenCount: 0,
    hasMore: false
  };

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService
  ) {}

  getCachedDropdownState(): DropdownNotificationState {
    return {
      items: [...this.cachedDropdownState.items],
      unseenCount: this.cachedDropdownState.unseenCount,
      hasMore: this.cachedDropdownState.hasMore
    };
  }

  getDropdownNotifications(limit = 7): Observable<DropdownNotificationState> {
    return this.getNotifications({ page: 1, limit }).pipe(
      map((response) => ({
        items: response.items || [],
        unseenCount: Number(response.unseenCount || 0),
        hasMore: response.hasMore === true
      })),
      tap((state) => {
        this.cachedDropdownState = {
          items: [...state.items],
          unseenCount: state.unseenCount,
          hasMore: state.hasMore
        };
      }),
      catchError(() => of(this.getCachedDropdownState()))
    );
  }

  getNotifications(options: NotificationQueryOptions = {}): Observable<NotificationListResponse> {
    const headers = this.authService.getAuthHeaders();
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.max(1, Number(options.limit || 15));
    const unseenOnly = options.unseenOnly === true;
    return this.http.get<NotificationListResponse>(
      `${this.apiUrl}?page=${page}&limit=${limit}&unseenOnly=${unseenOnly}`,
      { headers }
    ).pipe(
      map((response) => ({
        items: Array.isArray(response?.items) ? response.items : [],
        total: Number(response?.total || 0),
        page: Number(response?.page || page),
        limit: Number(response?.limit || limit),
        hasMore: response?.hasMore === true,
        unseenCount: Number(response?.unseenCount || 0)
      }))
    );
  }

  markAllSeen(): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.put<{ message: string }>(`${this.apiUrl}/mark-all-seen`, {}, { headers }).pipe(
      tap(() => {
        this.cachedDropdownState = {
          ...this.cachedDropdownState,
          unseenCount: 0,
          items: this.cachedDropdownState.items.map((item) => ({
            ...item,
            isSeen: true
          }))
        };
      }),
      map(() => void 0)
    );
  }

  markNotifications(ids: string[], isSeen: boolean): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.patch<{ updated: number }>(`${this.apiUrl}/mark`, { ids, isSeen }, { headers }).pipe(
      tap(() => {
        const selected = new Set((ids || []).map((id) => String(id)));
        const nextItems = this.cachedDropdownState.items.map((item) =>
          selected.has(item.id) ? { ...item, isSeen } : item
        );
        const unseenCount = nextItems.filter((item) => !item.isSeen).length;
        this.cachedDropdownState = {
          ...this.cachedDropdownState,
          items: nextItems,
          unseenCount
        };
      }),
      map(() => void 0)
    );
  }

  deleteNotification(id: string): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${encodeURIComponent(id)}`, { headers }).pipe(
      tap(() => {
        this.cachedDropdownState = this.buildDropdownStateAfterDelete(new Set([String(id)]), false);
      }),
      map(() => void 0)
    );
  }

  deleteNotifications(ids: string[]): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    const normalizedIds = (ids || []).map((id) => String(id)).filter(Boolean);
    return this.http.delete<{ deleted: number }>(`${this.apiUrl}`, {
      headers,
      body: { ids: normalizedIds }
    }).pipe(
      tap(() => {
        this.cachedDropdownState = this.buildDropdownStateAfterDelete(new Set(normalizedIds), false);
      }),
      map(() => void 0)
    );
  }

  deleteAllNotifications(unseenOnly = false): Observable<void> {
    const headers = this.authService.getAuthHeaders();
    return this.http.delete<{ deleted: number }>(`${this.apiUrl}`, {
      headers,
      body: { deleteAll: true, unseenOnly }
    }).pipe(
      tap(() => {
        this.cachedDropdownState = {
          items: [],
          unseenCount: 0,
          hasMore: false
        };
      }),
      map(() => void 0)
    );
  }

  private buildDropdownStateAfterDelete(ids: Set<string>, clearAll: boolean): DropdownNotificationState {
    const nextItems = clearAll
      ? []
      : this.cachedDropdownState.items.filter((item) => !ids.has(item.id));
    return {
      items: nextItems,
      unseenCount: nextItems.filter((item) => !item.isSeen).length,
      hasMore: clearAll ? false : this.cachedDropdownState.hasMore
    };
  }
}
