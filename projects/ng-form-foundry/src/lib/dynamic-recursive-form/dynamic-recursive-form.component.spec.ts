import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { NodeChoice, NodeGroup } from '../types/dynamic-recursive.types';

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

  it('switchCase swaps a choice group field controls', () => {
    const transport: NodeChoice = {
      kind: 'choice',
      name: 'transport',
      cases: {
        tcp: { 'tcp-port': { kind: 'leaf', type: 'number', name: 'tcp-port' } },
        udp: { 'udp-port': { kind: 'leaf', type: 'number', name: 'udp-port' } },
      },
    };
    component.formGroup.addControl(
      'transport',
      new FormGroup({ __case: new FormControl('tcp'), 'tcp-port': new FormControl(1) }),
    );

    component.switchCase('transport', transport, 'udp');

    const t = component.formGroup.get('transport') as FormGroup;
    expect(t.get('tcp-port')).toBeNull();
    expect(t.get('udp-port')).not.toBeNull();
  });
});
