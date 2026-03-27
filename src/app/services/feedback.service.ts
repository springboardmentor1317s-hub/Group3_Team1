// // src/app/services/feedback.service.ts
// import { Injectable } from '@angular/core';
// import { HttpClient } from '@angular/common/http';
// import { Observable } from 'rxjs';

// export interface Feedback {
//   _id: string;
//   eventId: string;
//   studentId: string;
//   feedback: string;
//   rating: number;
//   createdAt: string;
//   updatedAt: string;
// }

// @Injectable({
//   providedIn: 'root'
// })
// export class FeedbackService {
//   private readonly API_URL = 'http://localhost:5000/api/event-reviews';

//   constructor(private readonly http: HttpClient) {}

//   getAllFeedbacks(): Observable<Feedback[]> {
//     return this.http.get<Feedback[]>(this.API_URL);
//   }

//   getFeedbacksByEventId(eventId: string): Observable<Feedback[]> {
//     return this.http.get<Feedback[]>(`${this.API_URL}/event/${eventId}`);
//   }
// }


// src/app/services/feedback.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Feedback {
  _id: string;
  eventId: string;
  studentId: string;
  feedback: string;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private readonly API_URL = 'http://localhost:5000/api/event-reviews';  // ✅ Changed from /api/feedbacks

  constructor(private readonly http: HttpClient) {}

  getAllFeedbacks(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(this.API_URL);
  }

  getFeedbacksByEventId(eventId: string): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.API_URL}/event/${eventId}`);
  }
}