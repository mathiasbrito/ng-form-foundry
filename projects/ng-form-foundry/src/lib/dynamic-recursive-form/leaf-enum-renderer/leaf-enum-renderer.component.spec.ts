import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { LeafEnumRendererComponent } from './leaf-enum-renderer.component';
import { LeafEnum } from '../../types/dynamic-recursive.types';

describe('DrfLeafEnumRendererComponent', () => {
  let component: LeafEnumRendererComponent;
  let fixture: ComponentFixture<LeafEnumRendererComponent>;

  const leafEnum: LeafEnum = {
    kind: 'leaf',
    type: 'enum',
    name: 'choice',
    enum: ['a', 'b'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafEnumRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeafEnumRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('leafEnum', leafEnum);
    fixture.componentRef.setInput('control', new FormControl('a'));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
