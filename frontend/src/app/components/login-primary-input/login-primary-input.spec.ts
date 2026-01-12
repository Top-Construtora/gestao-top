import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPrimaryInput } from './login-primary-input';

describe('LoginPrimaryInput', () => {
  let component: LoginPrimaryInput;
  let fixture: ComponentFixture<LoginPrimaryInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPrimaryInput]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginPrimaryInput);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
