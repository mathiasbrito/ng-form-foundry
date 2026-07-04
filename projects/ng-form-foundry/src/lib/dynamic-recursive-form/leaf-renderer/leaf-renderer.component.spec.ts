import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { LeafRendererComponent } from './leaf-renderer.component';
import { Leaf } from '../../types/dynamic-recursive.types';

describe('DrfLeafRendererComponent', () => {
  let component: LeafRendererComponent;
  let fixture: ComponentFixture<LeafRendererComponent>;

  const leaf: Leaf = { kind: 'leaf', type: 'string', name: 'field' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LeafRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('leaf_', leaf);
    fixture.componentRef.setInput('control', new FormControl(''));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
