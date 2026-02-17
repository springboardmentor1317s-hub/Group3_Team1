import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private API_URL = "http://localhost:5000/api";

  constructor(private http: HttpClient) {}

  register(user: any) {
    return this.http.post(`${this.API_URL}/register`, user);
  }

}
