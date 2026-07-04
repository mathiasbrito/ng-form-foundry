import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';

import { AnonLeafRendererComponent } from './anon-leaf-renderer.component';
import { AnonLeaf } from '../../types/dynamic-recursive.types';

describe('DrfAnonLeafRendererComponent', () => {
  let component: AnonLeafRendererComponent;
  let fixture: ComponentFixture<AnonLeafRendererComponent>;

  const anonLeaf: AnonLeaf = { type: 'string' };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnonLeafRendererComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnonLeafRendererComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('AnonLeaf', anonLeaf);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('control', new FormControl(''));
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
