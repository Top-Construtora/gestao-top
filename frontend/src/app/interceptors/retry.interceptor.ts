import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError, timer, EMPTY } from 'rxjs';
import { catchError, retryWhen, mergeMap } from 'rxjs/operators';

// Circuit Breaker global para controlar sobrecarga do servidor
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5; // Máximo 5 falhas consecutivas
  private readonly recoveryTime = 30000; // 30 segundos para recovery

  isOpen(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.recoveryTime) {
        this.reset(); // Reset após recovery time
        return false;
      }
      return true; // Circuit está aberto (bloqueando requests)
    }
    return false;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      console.warn('🔥 Circuit Breaker ATIVADO - Bloqueando requests por 30s devido a sobrecarga do servidor');
    }
  }

  recordSuccess(): void {
    this.failureCount = Math.max(0, this.failureCount - 1);
  }

  reset(): void {
    console.info('🔄 Circuit Breaker RESETADO - Permitindo requests novamente');
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getStatus(): { isOpen: boolean; failureCount: number; timeUntilRecovery: number } {
    const now = Date.now();
    return {
      isOpen: this.isOpen(),
      failureCount: this.failureCount,
      timeUntilRecovery: Math.max(0, this.recoveryTime - (now - this.lastFailureTime))
    };
  }
}

const circuitBreaker = new CircuitBreaker();

export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  // Se circuit breaker está aberto, bloquear imediatamente
  if (circuitBreaker.isOpen()) {
    const status = circuitBreaker.getStatus();
    console.warn(`⛔ Request bloqueado pelo Circuit Breaker - Servidor sobrecarregado (Recovery em ${Math.ceil(status.timeUntilRecovery/1000)}s)`);
    return throwError(() => new HttpErrorResponse({
      status: 503,
      statusText: 'Service Temporarily Unavailable - Circuit Breaker Active',
      error: { message: 'Servidor temporariamente sobrecarregado. Tente novamente em alguns segundos.' }
    }));
  }

  const maxRetries = 2; // Reduzido de 3 para 2 tentativas

  // Calcular delay baseado no tipo de erro - delays mais conservadores
  const getRetryDelay = (error: HttpErrorResponse, attemptIndex: number): number => {
    if (error.status === 429) {
      // Para 429, usar backoff mais longo: 5s, 15s
      return [5000, 15000][attemptIndex] || 30000;
    }
    // Para outros erros, backoff moderado: 2s, 4s
    return [2000, 4000][attemptIndex] || 8000;
  };

  // Verificar se é um erro que vale a pena tentar novamente
  const shouldRetry = (error: HttpErrorResponse, attemptIndex: number): boolean => {
    // Se tivemos muitos 429s, ativar circuit breaker
    if (error.status === 429) {
      circuitBreaker.recordFailure();
      // Após 2 falhas de rate limiting, não tentar mais
      if (attemptIndex >= 1) {
        return false;
      }
    }
    
    return attemptIndex < maxRetries &&
           isResourceError(error) &&
           (error.status === 0 || error.status === 429 || error.status >= 500);
  };

  // Verificar se é um erro de recursos/conectividade
  const isResourceError = (error: HttpErrorResponse): boolean => {
    return error.status === 0 ||
           error.message?.includes('ERR_INSUFFICIENT_RESOURCES') ||
           error.message?.includes('ERR_NETWORK') ||
           error.status === 429 || // Too Many Requests
           error.status === 503 || // Service Unavailable
           error.status === 502 || // Bad Gateway
           error.status === 504;   // Gateway Timeout
  };

  return next(req).pipe(
    retryWhen(errors =>
      errors.pipe(
        mergeMap((error, index) => {
          if (shouldRetry(error, index)) {
            const delay = getRetryDelay(error, index);
            const statusText = error.status === 429 ? 'Rate Limited' : 'Network Error';
            
            // Log reduzido para evitar spam no console
            if (error.status === 429) {
              console.warn(`⏳ Rate limit atingido para ${req.url} - aguardando ${delay/1000}s (${index + 1}/${maxRetries})`);
            } else {
              console.warn(`🔄 ${statusText} para ${req.url} - tentativa ${index + 1}/${maxRetries} em ${delay/1000}s`);
            }
            
            return timer(delay);
          }

          // Se não vale a pena tentar novamente, propagar o erro
          return throwError(() => error);
        })
      )
    ),
    catchError((error: HttpErrorResponse) => {
      // Registrar sucesso se não foi erro de rate limiting
      if (error.status !== 429 && error.status < 500) {
        circuitBreaker.recordSuccess();
      }
      
      // Log do erro final apenas para erros graves
      if (isResourceError(error) && error.status !== 429) {
        console.error(`❌ Falha na requisição ${req.url}:`, {
          status: error.status,
          message: error.message
        });
      }

      return throwError(() => error);
    })
  );
};

// Exposer circuit breaker status para debug
(window as any).getCircuitBreakerStatus = () => circuitBreaker.getStatus();
(window as any).resetCircuitBreaker = () => circuitBreaker.reset();