import { Component } from '@angular/core';
import { buildFormFromSchema, ConfigEditorComponent } from 'ng-form-foundry';
import { MatButtonModule } from '@angular/material/button';
import { showcase, showcaseValue } from '../showcase-example/showcase-schema';

/**
 * The 0.3.0 showcase schema rendered by the tree editor: constraint validators,
 * readOnly/nullable leaves, a presence leaf offered by the "+ Optional field"
 * menu, a labeled choice with an inferred case, and both maps. The editor draws
 * no container of its own — placement and chrome are the embedding page's call.
 */
@Component({
  selector: 'app-showcase-tree-example',
  imports: [ConfigEditorComponent, MatButtonModule],
  template: `
    <h2>Tree editor — 0.3.0 showcase</h2>
    <nff-config-editor [schema]="schema" [formGroup]="form" />
    <button matButton (click)="print()">Print value to console</button>
  `,
})
export class ShowcaseTreeExample {
  protected readonly schema = showcase;
  protected readonly form = buildFormFromSchema(showcase, showcaseValue);

  print() {
    console.log(this.form.getRawValue());
  }
}
