import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PublicTeamMember {
  id: number | string;
  name: string;
  cargo?: string;
  profile_picture_path?: string;
  profile_picture_url?: string;
  is_fixed?: boolean;
}

export interface PublicTeamResponse {
  teamMembers: PublicTeamMember[];
}

@Injectable({
  providedIn: 'root'
})
export class PublicTeamService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getTeamMembers(): Observable<PublicTeamResponse> {
    return this.http.get<PublicTeamResponse>(`${this.API_URL}/team-members`);
  }

  getProfilePictureUrl(userId: number | string): string {
    if (typeof userId === 'string') {
      // For fixed CEO user, return the fixed image
      return '/naue2.jpg';
    }
    return `${this.API_URL}/${userId}/team-profile-picture`;
  }
}