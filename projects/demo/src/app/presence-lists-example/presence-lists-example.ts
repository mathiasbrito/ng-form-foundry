import { Component, inject, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { buildFormFromSchema, serializeForm, DynamicRecursiveFormComponent, NodeGroup } from 'ng-form-foundry';
import { Subscription } from 'rxjs';
import { CheatsheetDialog } from '../cheatsheet-dialog/cheatsheet-dialog';
import { presenceListsForm, presenceListsInitial } from './presence-lists-schema';

/**
 * Demonstrates optional (presence) lists end to end: the form on the left, and
 * on the right a live view of {@link serializeForm} (what would be written back)
 * plus an **editable JSON schema** — edit it and the form rebuilds, so the
 * options (a list's `presence`, a field's `required`, …) can be played with.
 */
@Component({
  selector: 'app-presence-lists-example',
  imports: [DynamicRecursiveFormComponent, MatButtonModule, MatIconModule],
  templateUrl: './presence-lists-example.html',
  styleUrl: './presence-lists-example.scss',
})
export class PresenceListsExample {
  private readonly dialog = inject(MatDialog);

  /** Open the schema cheatsheet reference dialog. */
  openCheatsheet(): void {
    this.dialog.open(CheatsheetDialog, { width: '90vw', maxWidth: '900px', maxHeight: '85vh' });
  }

  protected readonly schema = signal<NodeGroup>(presenceListsForm);
  protected readonly form = signal<FormGroup>(
    buildFormFromSchema(presenceListsForm, presenceListsInitial) as FormGroup,
  );
  protected readonly schemaText = signal(JSON.stringify(presenceListsForm, null, 2));
  protected readonly schemaError = signal<string | null>(null);
  protected readonly serialized = signal('');

  private sub?: Subscription;
  private applyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.bindForm(this.form());
  }

  /** Debounced: parse the edited JSON and, when valid, rebuild the form from it. */
  protected onSchemaInput(text: string): void {
    this.schemaText.set(text);
    clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => this.applySchema(text), 400);
  }

  private applySchema(text: string): void {
    let parsed: NodeGroup;
    try {
      parsed = JSON.parse(text) as NodeGroup;
    } catch (e) {
      this.schemaError.set((e as Error).message);
      return;
    }
    this.schemaError.set(null);
    const form = buildFormFromSchema(parsed, presenceListsInitial) as FormGroup;
    this.schema.set(parsed);
    this.form.set(form);
    this.bindForm(form);
  }

  /** Refresh the live serialized view against `form`, re-subscribing to it. */
  private bindForm(form: FormGroup): void {
    this.sub?.unsubscribe();
    this.serialized.set(this.snapshot(form));
    this.sub = form.valueChanges.subscribe(() => this.serialized.set(this.snapshot(form)));
  }

  private snapshot(form: FormGroup): string {
    return JSON.stringify(serializeForm(this.schema(), form), null, 2);
  }
}
