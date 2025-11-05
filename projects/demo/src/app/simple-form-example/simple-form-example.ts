import { Component, signal } from '@angular/core';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { simpleForm } from '../examples-schemas/simple';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-simple-form-example',
  imports: [
    DynamicRecursiveFormComponent, MatButtonModule
  ],
  templateUrl: './simple-form-example.component.html',
  styleUrl: './simple-form-example.component.scss',
})
export class SimpleFormExample {

  protected readonly title = signal('demo');
  formGroup = buildFormFromSchema(simpleForm, null);
  protected readonly simpleForm = simpleForm;


  print() {
    console.log(this.formGroup.value);
  }


}
