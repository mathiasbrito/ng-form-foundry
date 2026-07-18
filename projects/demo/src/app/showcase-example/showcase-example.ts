import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { JsonPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { buildFormFromSchema, DynamicRecursiveFormComponent, serializeForm } from 'ng-form-foundry';
import { showcase, showcaseValue } from './showcase-schema';

/**
 * Renders the {@link showcase} schema — every 0.3.0 feature in one form — beside
 * live views of the form value (`getRawValue()`, with the choice's `__case`
 * discriminator) and the wire value (`serializeForm`, without it), plus cards
 * describing the round-trip fixes the release also ships. Both panels update on
 * every edit, including map add/remove/rename and presence toggles.
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
  protected readonly wireValue = signal<unknown>(serializeForm(showcase, this.form));

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.value.set(this.form.getRawValue());
      this.wireValue.set(serializeForm(showcase, this.form));
    });
  }
}
