import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { UserService } from './user';

@Injectable({
  providedIn: 'root'
})
export class ProfilePictureService {
  private cache = new Map<number, string>();
  private loadingCache = new Map<number, Observable<string>>();

  constructor(private userService: UserService) {}

  getProfilePictureUrl(userId: number): Observable<string> {
    // Se já está em cache, retorna imediatamente
    if (this.cache.has(userId)) {
      return of(this.cache.get(userId)!);
    }

    // Se já está carregando, retorna o observable existente
    if (this.loadingCache.has(userId)) {
      return this.loadingCache.get(userId)!;
    }

    // Inicia o carregamento
    const loading$ = this.userService.getProfilePictureBlob(userId).pipe(
      map(blob => {
        // Verifica se o blob tem conteúdo válido
        if (blob.size === 0) {
          this.loadingCache.delete(userId);
          return '';
        }
        const url = URL.createObjectURL(blob);
        this.cache.set(userId, url);
        this.loadingCache.delete(userId);
        return url;
      }),
      catchError((error) => {
        this.loadingCache.delete(userId);
        // Não mostra erro no console para 404 (usuário sem foto)
        if (error.status !== 404) {
          console.warn('Erro ao carregar foto de perfil:', error);
        }
        return of('');
      }),
      tap(() => {
        // Remove da cache de loading quando completa
        this.loadingCache.delete(userId);
      })
    );

    this.loadingCache.set(userId, loading$);
    return loading$;
  }

  clearCache(userId?: number): void {
    if (userId) {
      const url = this.cache.get(userId);
      if (url) {
        URL.revokeObjectURL(url);
        this.cache.delete(userId);
      }
    } else {
      // Limpa todo o cache
      this.cache.forEach(url => URL.revokeObjectURL(url));
      this.cache.clear();
    }
  }

  invalidateCache(userId: number): void {
    this.clearCache(userId);
  }
}