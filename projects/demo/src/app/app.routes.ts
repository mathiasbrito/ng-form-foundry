import { Routes } from '@angular/router';
import { SimpleFormExample } from './simple-form-example/simple-form-example';
import { ComplexFormExample } from './complex-form-example/complex-form-example';
import { SplitFormExample } from './split-form-example/split-form-example';
import { InitialPage } from './initial-page/initial-page';
import { YangExample } from './yang-example/yang-example';
import { TreeEditorExample } from './tree-editor-example/tree-editor-example';
import { ComplexTreeExample } from './complex-tree-example/complex-tree-example';
import { ShowcaseExample } from './showcase-example/showcase-example';
import { A1PolicyExample } from './a1-policy-example/a1-policy-example';

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
  },
  {
    path: 'yang',
    component: YangExample
  },
  {
    path: 'showcase',
    component: ShowcaseExample
  },
  {
    path: 'a1-policy',
    component: A1PolicyExample
  },
  {
    path: 'tree',
    component: TreeEditorExample
  },
  {
    path: 'complex-tree',
    component: ComplexTreeExample
  }
];
