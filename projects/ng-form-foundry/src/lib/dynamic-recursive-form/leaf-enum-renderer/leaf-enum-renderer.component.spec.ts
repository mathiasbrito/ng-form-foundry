import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafEnumRendererComponent } from './leaf-enum-renderer.component';

describe('DrfLeafEnumRendererComponent', () => {
  let component: LeafEnumRendererComponent;
  let fixture: ComponentFixture<LeafEnumRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafEnumRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeafEnumRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
