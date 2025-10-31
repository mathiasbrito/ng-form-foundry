import { Component, inject, OnInit, signal } from '@angular/core';
import { buildFormFromSchema, DUConfigSchema, DynamicRecursiveFormComponent, sampleValue } from 'ng-form-foundry';
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  imports: [DynamicRecursiveFormComponent],
  template: `
        <nff-dynamic-recursive-form
            [schema]="DUConfigSchema"
            [formGroup]="formGroup"
            [initialValue]="sampleValue"
        ></nff-dynamic-recursive-form>
      `,
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private matIconReg = inject(MatIconRegistry);
  protected readonly title = signal('demo');
  protected readonly DUConfigSchema = DUConfigSchema;
  formGroup = buildFormFromSchema(DUConfigSchema);
  protected readonly sampleValue = sampleValue;

  ngOnInit(): void {
    this.matIconReg.setDefaultFontSetClass('material-symbols-outlined');
  }
}

