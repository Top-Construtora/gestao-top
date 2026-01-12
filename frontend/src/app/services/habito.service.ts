import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Habit {
  id?: number;
  name: string;
  goal: number;
  description: string;
  notes: string;
  statuses: string[];
}

export interface HabitMonth {
  id?: number;
  user_id?: number;
  year: number;
  month: number;
  days: number;
  habits: Habit[];
}

@Injectable({
  providedIn: 'root'
})
export class HabitoService {
  private apiUrl = `${environment.apiUrl}/habitos`;

  constructor(private http: HttpClient) {}

  /**
   * Buscar hábitos de um mês específico
   */
  getHabitsByMonth(year: number, month: number): Observable<HabitMonth | null> {
    return this.http.get<HabitMonth>(`${this.apiUrl}/${year}/${month}`);
  }

  /**
   * Salvar hábitos do mês
   */
  saveHabits(habitMonth: HabitMonth): Observable<any> {
    return this.http.post(`${this.apiUrl}`, habitMonth);
  }

  /**
   * Atualizar hábitos do mês
   */
  updateHabits(id: number, habitMonth: HabitMonth): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, habitMonth);
  }

  /**
   * Deletar hábitos de um mês
   */
  deleteHabits(year: number, month: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${year}/${month}`);
  }

  /**
   * Obter todos os meses com hábitos cadastrados
   */
  getAllMonths(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/months`);
  }
}
