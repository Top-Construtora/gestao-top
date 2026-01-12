import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
  cargo?: string;
}

export interface UpdateUserRequest {
  email?: string;
  name?: string;
  role?: 'admin' | 'user';
  password?: string;
  is_active?: boolean;
  cargo?: string;
  show_in_team?: boolean;
}

export interface ApiUser {
  id: number;
  email: string;
  name: string;
  role_name: string;
  is_active: boolean;
  created_at: string;
  must_change_password?: boolean;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  login_count?: number;
  profile_picture_path?: string;
  profile_picture_uploaded_at?: string;
  cargo?: string;
  show_in_team?: boolean;
}

export interface AssignableUser {
  id: number;
  name: string;
  email: string;
  profile_picture_path?: string;
  cargo?: string;
}

export interface UsersResponse {
  users: ApiUser[];
}

export interface CreateUserResponse {
  message: string;
  user: ApiUser;
}

export interface TeamMember {
  id: number | string;
  name: string;
  cargo?: string;
  profile_picture_path?: string;
  profile_picture_url?: string;
  is_fixed?: boolean;
}

export interface TeamMembersResponse {
  teamMembers: TeamMember[];
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getUsers(params?: { is_active?: boolean }): Observable<UsersResponse> {
    return this.http.get<UsersResponse>(this.API_URL, { params });
  }

  createUser(userData: CreateUserRequest): Observable<CreateUserResponse> {
    return this.http.post<CreateUserResponse>(this.API_URL, userData);
  }

  updateUser(id: number, userData: UpdateUserRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, userData);
  }

  toggleUserStatus(id: number): Observable<any> {
    return this.http.patch(`${this.API_URL}/${id}/toggle-status`, {});
  }

  softDeleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}/soft-delete`);
  }

  hardDeleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}/hard-delete`);
  }

  resetUserPassword(id: number): Observable<any> {
    return this.http.post(`${this.API_URL}/${id}/reset-password`, {});
  }

  getUsersForAssignment(): Observable<AssignableUser[]> {
    return this.http.get<AssignableUser[]>(`${this.API_URL}/list-for-assignment`);
  }

  generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Profile picture methods
  uploadProfilePicture(userId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('profilePicture', file);
    return this.http.post(`${this.API_URL}/${userId}/profile-picture`, formData);
  }

  getProfilePictureUrl(userId: number): string {
    return `${this.API_URL}/${userId}/profile-picture`;
  }

  getProfilePictureBlob(userId: number): Observable<Blob> {
    return this.http.get(`${this.API_URL}/${userId}/profile-picture`, { responseType: 'blob' });
  }

  deleteProfilePicture(userId: number): Observable<any> {
    return this.http.delete(`${this.API_URL}/${userId}/profile-picture`);
  }

  // Team visibility methods
  updateTeamVisibility(userId: number, showInTeam: boolean): Observable<any> {
    return this.http.patch(`${this.API_URL}/${userId}/team-visibility`, { show_in_team: showInTeam });
  }

  getTeamMembers(): Observable<TeamMembersResponse> {
    return this.http.get<TeamMembersResponse>(`${this.API_URL}/team-members`);
  }
}