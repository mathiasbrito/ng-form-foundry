import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafRendererComponent } from './leaf-renderer.component';

describe('DrfLeafRendererComponent', () => {
  let component: LeafRendererComponent;
  let fixture: ComponentFixture<LeafRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeafRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
