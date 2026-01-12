import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContractViewPageComponent } from './contract-view-page';

describe('ContractViewPageComponent', () => {
  let component: ContractViewPageComponent;
  let fixture: ComponentFixture<ContractViewPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractViewPageComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ContractViewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});