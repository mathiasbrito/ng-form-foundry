import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SplitFormExample } from './split-form-example';

describe('SplitFormExampleComponent', () => {
  let component: SplitFormExample;
  let fixture: ComponentFixture<SplitFormExample>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitFormExample]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SplitFormExample);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
