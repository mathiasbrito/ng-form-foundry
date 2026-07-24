import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * A reference dialog listing the schema building blocks — node kinds, leaf
 * types, optionality, validation, and appearance — so a user can see at a
 * glance what a form-description schema can express and change.
 */
@Component({
  selector: 'app-cheatsheet-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './cheatsheet-dialog.html',
  styleUrl: './cheatsheet-dialog.scss',
})
export class CheatsheetDialog {
  protected readonly example = `{
  "kind": "nodeGroup", "name": "gNB", "root": true,
  "children": {
    "gNB_ID": {
      "kind": "leaf", "type": "number", "name": "gNB_ID",
      "integer": true, "min": 0
    },
    "amf_ip_address": {
      "kind": "leafList", "type": "string", "name": "amf_ip_address",
      "presence": true
    },
    "served_cells": {
      "kind": "nodeGroupList", "name": "served_cells", "minItems": 1,
      "type": {
        "kind": "nodeGroup", "name": "cell",
        "appearance": { "flatten": true },
        "children": {
          "cell_id": { "kind": "leaf", "type": "number", "name": "cell_id" }
        }
      }
    }
  }
}`;
}

