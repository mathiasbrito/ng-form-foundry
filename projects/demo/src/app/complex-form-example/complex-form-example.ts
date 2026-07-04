import { Component, signal } from '@angular/core';
import { buildFormFromSchema, DynamicRecursiveFormComponent } from 'ng-form-foundry';
import { DUConfigSchema, sampleValue } from './complex-oai';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-complex-form-example',
  imports: [MatButtonModule, DynamicRecursiveFormComponent],
  templateUrl: './complex-form-example.html',
  styleUrl: './complex-form-example.scss',
})
export class ComplexFormExample {

  protected readonly title = signal('demo');
  protected readonly DUConfigSchema = DUConfigSchema;
  duFormGroup = buildFormFromSchema(DUConfigSchema, sampleValue);
  protected readonly sampleValue = sampleValue;


  print() {
    console.log(this.duFormGroup.value);
  }

}
