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

  it('togglePresence adds then removes a presence child control', () => {
    const ntp: NodeGroup = {
      kind: 'nodeGroup',
      name: 'ntp',
      presence: true,
      children: { server: { kind: 'leaf', type: 'string', name: 'server' } },
    };

    component.togglePresence('ntp', ntp, true);
    expect(component.formGroup.get('ntp')).not.toBeNull();

    component.togglePresence('ntp', ntp, false);
    expect(component.formGroup.get('ntp')).toBeNull();
  });
});
