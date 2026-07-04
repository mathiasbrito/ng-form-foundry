import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';

import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { NodeGroup } from '../types/dynamic-recursive.types';

describe('DynamicRecursiveFormComponent', () => {
  let component: DynamicRecursiveFormComponent;
  let fixture: ComponentFixture<DynamicRecursiveFormComponent>;

  const schema: NodeGroup = { kind: 'nodeGroup', name: 'root', children: {} };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicRecursiveFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicRecursiveFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('schema', schema);
    fixture.componentRef.setInput('formGroup', new FormGroup({}));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
