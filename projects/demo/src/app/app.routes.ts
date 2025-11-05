import { Routes } from '@angular/router';
import { SimpleFormExample } from './simple-form-example/simple-form-example';
import { ComplexFormExample } from './complex-form-example/complex-form-example';
import { SplitFormExample } from './split-form-example/split-form-example';
import { InitialPage } from './initial-page/initial-page';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'initial',
    pathMatch: 'full',
  },
  {
    path: 'initial',
    component: InitialPage,
  },
  {
    path: 'complex',
    component: ComplexFormExample
  },
  {
    path: 'simple',
    component: SimpleFormExample
  },
  {
    path: 'split',
    component: SplitFormExample
  }
];
