import { Component, inject, OnInit, signal } from '@angular/core';
import { buildFormFromSchema, DUConfigSchema, DynamicRecursiveFormComponent, sampleValue } from 'ng-form-foundry';
import { MatIconRegistry } from '@angular/material/icon';
import { simpleForm } from './examples/simple';

@Component({
  selector: 'app-root',
  imports: [DynamicRecursiveFormComponent],
  template: `
    <nff-dynamic-recursive-form
      [schema]="simpleForm"
      [formGroup]="formGroup"
    ></nff-dynamic-recursive-form>
    <nff-dynamic-recursive-form
      [schema]="DUConfigSchema"
      [formGroup]="duFormGroup"
      [initialValue]="sampleValue"
    ></nff-dynamic-recursive-form>
  `,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private matIconReg = inject(MatIconRegistry);
  protected readonly title = signal('demo');
  protected readonly DUConfigSchema = DUConfigSchema;
  formGroup = buildFormFromSchema(simpleForm, null);
  duFormGroup = buildFormFromSchema(DUConfigSchema, sampleValue);
  protected readonly sampleValue = sampleValue;

  ngOnInit(): void {
    this.matIconReg.setDefaultFontSetClass('material-symbols-outlined');
  }

  protected readonly simpleForm = simpleForm;
}

