import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { mustChangePasswordGuard } from './must-change-password-guard';

describe('mustChangePasswordGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => mustChangePasswordGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
