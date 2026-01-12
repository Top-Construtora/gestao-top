import { Injectable } from '@angular/core';
import { Observable, Subject, timer, EMPTY, throwError } from 'rxjs';
import { debounceTime, switchMap, share, tap, catchError } from 'rxjs/operators';

interface RequestQueue {
  [key: string]: Subject<any>;
}

@Injectable({
  providedIn: 'root'
})
export class RateLimitService {
  private requestQueue: RequestQueue = {};
  private lastRequestTime: { [key: string]: number } = {};
  private activeRequests: Set<string> = new Set(); // Tracking active requests
  private readonly minInterval = 1000; // Aumentado para 1 segundo entre requests
  private readonly maxConcurrentRequests = 3; // Máximo 3 requests simultâneos

  constructor() {
    // Limpar caches antigos periodicamente
    setInterval(() => this.cleanupOldEntries(), 60000); // A cada minuto
  }

  /**
   * Executar request com debounce e rate limiting
   */
  executeRequest<T>(key: string, requestFn: () => Observable<T>, debounceMs: number = 500): Observable<T> {
    // Se já temos muitos requests ativos, aguardar
    if (this.activeRequests.size >= this.maxConcurrentRequests) {
      console.warn(`🚦 Rate limit: ${this.activeRequests.size} requests ativos, aguardando...`);
      return timer(debounceMs * 2).pipe(
        switchMap(() => this.executeRequest(key, requestFn, debounceMs))
      );
    }
    // Verificar se já existe uma queue para este endpoint
    if (!this.requestQueue[key]) {
      this.requestQueue[key] = new Subject<() => Observable<T>>();

      // Configurar pipeline com debounce mais agressivo
      this.requestQueue[key].pipe(
        debounceTime(debounceMs),
        switchMap((fn: () => Observable<T>) => {
          // Verificar se já está executando este request
          if (this.activeRequests.has(key)) {
            console.log(`🔄 Request ${key} já em execução, ignorando duplicado`);
            return EMPTY; // Ignorar requests duplicados
          }

          // Verificar rate limiting
          const now = Date.now();
          const lastRequest = this.lastRequestTime[key] || 0;
          const timeSinceLastRequest = now - lastRequest;

          if (timeSinceLastRequest < this.minInterval) {
            // Aguardar tempo mínimo antes de executar
            const waitTime = this.minInterval - timeSinceLastRequest;
            console.log(`⏱️ Rate limiting: aguardando ${waitTime}ms para ${key}`);
            return timer(waitTime).pipe(
              switchMap(() => {
                this.activeRequests.add(key);
                this.lastRequestTime[key] = Date.now();
                return fn().pipe(
                  tap(() => this.activeRequests.delete(key)),
                  catchError(err => {
                    this.activeRequests.delete(key);
                    return throwError(() => err);
                  })
                );
              })
            );
          } else {
            // Executar imediatamente
            this.activeRequests.add(key);
            this.lastRequestTime[key] = now;
            return fn().pipe(
              tap(() => this.activeRequests.delete(key)),
              catchError(err => {
                this.activeRequests.delete(key);
                return throwError(() => err);
              })
            );
          }
        }),
        share() // Compartilhar resultado entre múltiplas subscrições
      ).subscribe();
    }

    // Adicionar request à queue
    this.requestQueue[key].next(requestFn);

    // Retornar observable que será resolvido quando o request for executado
    return new Observable<T>(subscriber => {
      const subscription = this.requestQueue[key].pipe(
        debounceTime(debounceMs),
        switchMap((fn: () => Observable<T>) => {
          const now = Date.now();
          const lastRequest = this.lastRequestTime[key] || 0;
          const timeSinceLastRequest = now - lastRequest;

          if (timeSinceLastRequest < this.minInterval) {
            const waitTime = this.minInterval - timeSinceLastRequest;
            return timer(waitTime).pipe(
              switchMap(() => {
                this.lastRequestTime[key] = Date.now();
                return fn();
              })
            );
          } else {
            this.lastRequestTime[key] = now;
            return fn();
          }
        })
      ).subscribe({
        next: (result) => subscriber.next(result),
        error: (error) => subscriber.error(error),
        complete: () => subscriber.complete()
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * Limpar queue para um endpoint específico
   */
  clearQueue(key: string): void {
    if (this.requestQueue[key]) {
      this.requestQueue[key].complete();
      delete this.requestQueue[key];
      delete this.lastRequestTime[key];
    }
  }

  /**
   * Limpar todas as queues
   */
  clearAllQueues(): void {
    Object.keys(this.requestQueue).forEach(key => {
      this.requestQueue[key].complete();
    });
    this.requestQueue = {};
    this.lastRequestTime = {};
  }

  /**
   * Verificar se pode fazer request para um endpoint
   */
  canMakeRequest(key: string): boolean {
    const now = Date.now();
    const lastRequest = this.lastRequestTime[key] || 0;
    return (now - lastRequest) >= this.minInterval;
  }

  /**
   * Obter tempo restante até poder fazer próximo request
   */
  getTimeUntilNextRequest(key: string): number {
    const now = Date.now();
    const lastRequest = this.lastRequestTime[key] || 0;
    const timeSinceLastRequest = now - lastRequest;
    return Math.max(0, this.minInterval - timeSinceLastRequest);
  }

  /**
   * Limpar entradas antigas para evitar memory leaks
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutos
    
    Object.keys(this.lastRequestTime).forEach(key => {
      if (now - this.lastRequestTime[key] > maxAge) {
        delete this.lastRequestTime[key];
        if (this.requestQueue[key]) {
          this.requestQueue[key].complete();
          delete this.requestQueue[key];
        }
      }
    });
  }

  /**
   * Obter status atual do rate limiting
   */
  getStatus(): {
    activeRequests: number;
    queuedEndpoints: string[];
    lastRequestTimes: { [key: string]: number };
  } {
    return {
      activeRequests: this.activeRequests.size,
      queuedEndpoints: Object.keys(this.requestQueue),
      lastRequestTimes: { ...this.lastRequestTime }
    };
  }
}