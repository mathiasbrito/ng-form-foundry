import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { NodeMapRendererComponent } from './node-map-renderer.component';
import { NodeMap } from '../../types/dynamic-recursive.types';

describe('NodeMapRendererComponent', () => {
  let component: NodeMapRendererComponent;
  let fixture: ComponentFixture<NodeMapRendererComponent>;

  const nodeMap: NodeMap = {
    kind: 'map',
    name: 'labels',
    value: { kind: 'leaf', type: 'string', name: 'value' },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodeMapRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NodeMapRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nodeMap', nodeMap);
    fixture.componentRef.setInput('formGroup', new FormGroup({ alpha: new FormControl('a') }));
    fixture.detectChanges();
  });

  it('lists the initial entry keys', () => {
    expect(component).toBeTruthy();
    expect(component.entryKeys).toEqual(['alpha']);
  });

  it('addEntry appends a uniquely-keyed control', () => {
    component.addEntry();
    expect(component.entryKeys.length).toBe(2);
    expect(component.formGroup.contains(component.entryKeys[1])).toBe(true);
  });

  it('removeEntry drops the control and the key', () => {
    component.removeEntry('alpha');
    expect(component.entryKeys).toEqual([]);
    expect(component.formGroup.contains('alpha')).toBe(false);
  });

  it('renameEntry re-keys the control in place, preserving its value and position', () => {
    component.renameEntry('alpha', 'beta');
    expect(component.formGroup.contains('alpha')).toBe(false);
    expect(component.formGroup.get('beta')!.value).toBe('a');
    expect(component.entryKeys).toEqual(['beta']);
  });

  it('renders and renames entries whose keys contain dots (keys are names, not control paths)', () => {
    fixture = TestBed.createComponent(NodeMapRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nodeMap', nodeMap);
    fixture.componentRef.setInput('formGroup', new FormGroup({ '10.0.0.1': new FormControl('edge') }));
    fixture.detectChanges();

    // The value input binds the entry's own control, not a dot-path traversal.
    const inputs: HTMLInputElement[] = [...fixture.nativeElement.querySelectorAll('input')];
    expect(inputs.map((i) => i.value)).toEqual(['10.0.0.1', 'edge']);

    component.renameEntry('10.0.0.1', 'gateway.local');
    expect(component.formGroup.contains('gateway.local')).toBe(true);
    expect(component.formGroup.controls['gateway.local'].value).toBe('edge');
  });

  it('renameEntry ignores a duplicate, empty, or unchanged key', () => {
    component.addEntry(); // 'key2'
    const second = component.entryKeys[1];

    component.renameEntry(second, 'alpha'); // duplicate -> ignored
    expect(component.formGroup.contains(second)).toBe(true);

    component.renameEntry('alpha', '   '); // empty -> ignored
    expect(component.formGroup.contains('alpha')).toBe(true);
  });

  it('getRawValue is the map object, keyed by the entry keys', () => {
    component.renameEntry('alpha', 'beta');
    component.addEntry();
    component.formGroup.get(component.entryKeys[1])!.setValue('z');
    const value = component.formGroup.getRawValue();
    expect(value['beta']).toBe('a');
    expect(Object.keys(value).length).toBe(2);
  });
});
