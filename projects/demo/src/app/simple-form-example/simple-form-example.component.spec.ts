import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimpleFormExample } from './simple-form-example';

describe('SimpleFormExampleComponent', () => {
  let component: SimpleFormExample;
  let fixture: ComponentFixture<SimpleFormExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimpleFormExample]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SimpleFormExample);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
