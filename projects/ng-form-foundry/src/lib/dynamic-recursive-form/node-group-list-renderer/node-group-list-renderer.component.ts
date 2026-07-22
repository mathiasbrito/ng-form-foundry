import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  forwardRef,
  inject,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChildren
} from '@angular/core';
import { Appearance, NodeGroupList } from '../../types/dynamic-recursive.types';
import { FormArray, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DynamicRecursiveFormComponent } from '../dynamic-recursive-form.component';
import { buildFormFromSchema } from '../../core/dynamic-recursive-forms-builder';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'nff-node-group-list-renderer',
  standalone: true,
  imports: [
    forwardRef(() => DynamicRecursiveFormComponent),
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './node-group-list-renderer.component.html',
  styleUrl: './node-group-list-renderer.component.scss',
})
export class NodeGroupListRendererComponent implements OnInit, AfterViewInit {
  @Input() nodeGroupList!: NodeGroupList;
  @Input() initialValue!: number[] | string[] | boolean[];
  @Input() formArray = new FormArray<any>([]);
  @Input() editable: boolean = true;
  /** Forwarded to each entry's embedded form — see the form's input of the same name. */
  @Input() showAbsentOptionals = false;
  // Schema-driven bounds, matching the config editor: absent minItems floors
  // at 0 (an unbounded list can be emptied), absent maxItems is unbounded.
  @Input() minItems: number = 0;
  @Input() maxItems: number = Number.POSITIVE_INFINITY;
  /** Field-layout appearance from the enclosing group, forwarded to every item form. */
  @Input() inheritedAppearance: Appearance | null = null;
  @Output() message = new EventEmitter();
  // forwardRef: DynamicRecursiveFormComponent and this component import each
  // other, so the class reference is undefined when this query is evaluated at
  // decoration time. forwardRef defers the lookup and keeps the selector valid.
  @ViewChildren(forwardRef(() => DynamicRecursiveFormComponent))
  items!: QueryList<DynamicRecursiveFormComponent>;

  cdr = inject(ChangeDetectorRef);

  ngOnInit() {
    if (this.initialValue) {
      this.formArray.patchValue(this.initialValue);
    }
  }

  // Effective bounds: the schema wins when it declares them (an explicit
  // `minItems: 0` included), else the `@Input` fallback for a host that binds
  // the renderer directly. Getters, so a schema rebind is reflected live.
  get effectiveMin(): number {
    return this.nodeGroupList?.minItems ?? this.minItems;
  }
  get effectiveMax(): number {
    return this.nodeGroupList?.maxItems ?? this.maxItems;
  }

  /** Whether another item may be appended (below the effective maximum). */
  get canAdd(): boolean {
    return this.formArray.length < this.effectiveMax;
  }

  ngAfterViewInit() {
    this.items.changes.subscribe(() => {
      this.setLastEditable();
    });
  }

  removeItem($index: number) {
    if (this.formArray.length <= this.effectiveMin) {
      this.message.emit({
        message: `You cannot remove the last ${this.nodeGroupList.type.name} configuration!`,
        type: 'error',
      })
      return;
    }
    this.formArray.removeAt($index);
  }

  addItem = (index?: number) => {
    if (this.formArray.length >= this.effectiveMax) return;
    this.formArray.push(buildFormFromSchema(this.nodeGroupList.type, null));
  }

  setLastEditable() {
    const lastItem = this.items.last;
    if (lastItem) {
      lastItem.editable.set(true);
    }
    this.cdr.detectChanges();
  }

  asFormGroup(group: any) {
    return group as FormGroup;
  }

  getTitle($index: number) {
    let title = `${this.nodeGroupList.type.label ?? this.nodeGroupList.type.name}`;
    if (this.formArray.length > 1) {
      return `${title} #${$index + 1}`;
    }
    else {
      return title;
    }

  }
}
