import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CheatsheetDialog } from '../cheatsheet-dialog/cheatsheet-dialog';

@Component({
  selector: 'app-initial-page',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './initial-page.html',
  styleUrl: './initial-page.scss',
})
export class InitialPage {
  private readonly dialog = inject(MatDialog);

  /** Open the schema cheatsheet reference dialog. */
  openCheatsheet(): void {
    this.dialog.open(CheatsheetDialog, { width: '90vw', maxWidth: '900px', maxHeight: '85vh' });
  }
}
