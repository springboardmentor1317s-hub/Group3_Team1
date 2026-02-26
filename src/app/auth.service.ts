import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private API_URL = "http://localhost:5000/api";

  constructor(private http: HttpClient) {}

  register(user: any) {
    // backend uses '/signup'
    return this.http.post(`${this.API_URL}/signup`, user);
  }

  login(identifier: string, password: string, role?: string) {
    const body: any = { identifier, password };
    if (role) {
      body.role = role;
    }
    return this.http
      .post<{ token: string; role: string; name: string }>(
        `${this.API_URL}/login`,
        body
      )
      .pipe(
        tap((res) => {
          // store token & role locally
          this.setToken(res.token);
          this.setRole(res.role);
        })
      );
  }

  setRole(role: string) {
    localStorage.setItem('role', role);
  }

  getRole(): string | null {
    return localStorage.getItem('role');
  }

  setToken(token: string) {
    localStorage.setItem('token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  logout() {
    localStorage.clear();
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }
}
