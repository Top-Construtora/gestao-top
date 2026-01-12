import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewCompanyPage } from './new-company-page';

describe('NewCompanyPage', () => {
  let component: NewCompanyPage;
  let fixture: ComponentFixture<NewCompanyPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewCompanyPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewCompanyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
