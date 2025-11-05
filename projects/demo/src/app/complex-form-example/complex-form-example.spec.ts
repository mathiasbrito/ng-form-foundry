import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComplexFormExample } from './complex-form-example';

describe('ComplexFormExample', () => {
  let component: ComplexFormExample;
  let fixture: ComponentFixture<ComplexFormExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComplexFormExample]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComplexFormExample);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
