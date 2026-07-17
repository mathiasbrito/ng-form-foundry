import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { JsonPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { showcase, showcaseValue } from './showcase-schema';

/**
 * Renders the {@link showcase} schema — every 0.3.0 feature in one form — beside a
 * live view of `getRawValue()` and cards describing the round-trip fixes the
 * release also ships. The value panel updates on every edit, including map
 * add/remove/rename and presence toggles.
 */
@Component({
  selector: 'app-showcase-example',
  imports: [DynamicRecursiveFormComponent, JsonPipe, MatCardModule],
  templateUrl: './showcase-example.html',
  styleUrl: './showcase-example.scss',
})
export class ShowcaseExample {
  protected readonly schema = showcase;
  protected readonly form = buildFormFromSchema(showcase, showcaseValue);
  protected readonly value = signal<unknown>(this.form.getRawValue());

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.value.set(this.form.getRawValue()));
  }
}
