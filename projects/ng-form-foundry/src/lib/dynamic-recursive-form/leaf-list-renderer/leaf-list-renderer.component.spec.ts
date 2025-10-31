import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafListRendererComponent } from './leaf-list-renderer.component';

describe('DrfLeafListRendererComponent', () => {
  let component: LeafListRendererComponent;
  let fixture: ComponentFixture<LeafListRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafListRendererComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeafListRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
