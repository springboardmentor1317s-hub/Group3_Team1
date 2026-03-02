import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private API_URL = 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  signup(user: any) {
    return this.http.post(`${this.API_URL}/signup`, user);
  }

  login(credentials: any) {
    return this.http.post(`${this.API_URL}/login`, credentials);
  }

}