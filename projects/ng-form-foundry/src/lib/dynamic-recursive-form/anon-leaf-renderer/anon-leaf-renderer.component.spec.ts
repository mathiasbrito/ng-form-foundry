import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnonLeafRendererComponent } from './anon-leaf-renderer.component';

describe('DrfAnonLeafRendererComponent', () => {
  let component: AnonLeafRendererComponent;
  let fixture: ComponentFixture<AnonLeafRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnonLeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnonLeafRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
