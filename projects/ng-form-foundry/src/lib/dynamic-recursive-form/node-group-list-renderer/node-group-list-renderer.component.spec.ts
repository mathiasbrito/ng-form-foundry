import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray } from '@angular/forms';

import { NodeGroupListRendererComponent } from './node-group-list-renderer.component';
import { NodeGroupList } from '../../types/dynamic-recursive.types';

describe('DrfNodeListRendererComponent', () => {
  let component: NodeGroupListRendererComponent;
  let fixture: ComponentFixture<NodeGroupListRendererComponent>;

  const nodeGroupList: NodeGroupList = {
    kind: 'nodeGroupList',
    name: 'items',
    type: { kind: 'nodeGroup', name: 'item', children: {} },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodeGroupListRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NodeGroupListRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nodeGroupList', nodeGroupList);
    fixture.componentRef.setInput('formArray', new FormArray<any>([]));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
