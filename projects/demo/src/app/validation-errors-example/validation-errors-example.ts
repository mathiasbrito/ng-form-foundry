import { Component } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { invalidValue, validationSchema } from './validation-schema';

/**
 * The tree editor over a form seeded with invalid values: rows with a
 * validation error below them show a red error button. Hover or focus it to
 * list every error under that node — each a link that selects the node and
 * focuses the field; clicking the icon jumps to the first.
 */
@Component({
  selector: 'app-validation-errors-example',
  imports: [ConfigEditorComponent, MatButtonModule],
  template: `
    <h2>Tree editor — validation errors</h2>
    <p class="hint">
      This form is seeded with bad values, so rows carry a red <strong>error</strong> button. Hover or
      keyboard-focus it to see <em>which</em> fields are invalid and <em>where</em> — each entry is a
      link that jumps to the field and focuses it. Clicking the icon goes to the first error. Fix a
      field and its markers clear.
    </p>
    <nff-config-editor [schema]="schema" [formGroup]="form" [initiallyExpanded]="true" />
    <button matButton (click)="print()">Print value to console</button>
  `,
  styles: `
    .hint {
      max-width: 64ch;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ValidationErrorsExample {
  protected readonly schema = validationSchema;
  protected readonly form = buildFormFromSchema(validationSchema, invalidValue);

  print() {
    console.log(this.form.getRawValue());
  }
}
