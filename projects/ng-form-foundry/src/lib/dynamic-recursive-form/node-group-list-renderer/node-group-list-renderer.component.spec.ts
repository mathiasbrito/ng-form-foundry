import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NodeGroupListRendererComponent } from './node-group-list-renderer.component';

describe('DrfNodeListRendererComponent', () => {
  let component: NodeGroupListRendererComponent;
  let fixture: ComponentFixture<NodeGroupListRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodeGroupListRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NodeGroupListRendererComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
