# Installation

## Install

```bash
npm install ng-form-foundry
```

## Peer dependencies

`ng-form-foundry` renders with Angular Material, so your application must provide
these packages:

| Package | Version |
| --- | --- |
| `@angular/core`, `@angular/common`, `@angular/forms` | `^20.1.0` |
| `@angular/material`, `@angular/cdk` | `^20.2.0` |
| `rxjs` | `^7.8.0` |

If you don't already use Angular Material, add it:

```bash
ng add @angular/material
# or
npm install @angular/material @angular/cdk
```

## Application setup

Two things must be in place for the rendered forms to look correct: a Material
theme and the Material Icons font. Animations are optional.

That is the complete list — the library's component styles are self-contained
(the compact add/remove/edit icon buttons included), so no global stylesheet
rules, style imports, or Sass mixins from this package are needed or offered.
If the controls render at stock Material sizes, the missing piece is the
theme, not library CSS.

### 1. Load a Material theme

```scss
// styles.scss
@use '@angular/material' as mat;

html {
  @include mat.theme((
    color: mat.$violet-palette,
    typography: Roboto,
    density: 0,
  ));
}
```

### 2. Load the Material Icons font

The add / remove / edit controls use icon buttons. Include the font in your
`index.html`:

```html
<link
  href="https://fonts.googleapis.com/icon?family=Material+Icons"
  rel="stylesheet"
/>
```

### Optional: animations

Angular Material components render without animations. If you want animated
transitions (expansion panels, tooltips), install `@angular/animations` and add
the provider:

```ts
// app.config.ts
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [provideAnimationsAsync() /* ...others */],
};
```

## Optional: the transformers package

If you generate schemas from a **YAML/JSON config** or a **YANG model** instead of
authoring them by hand, install the companion Node package on your **backend** (it
has no Angular or browser dependency):

```bash
npm install ng-form-foundry-transformers
```

See [Transformers](transformers.md). The browser package above is all you need to
render hand-authored schemas.

## Verify

Import the component and the builder in a standalone component and render a
minimal schema — see the [Quickstart](quickstart.md).
