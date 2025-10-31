import { Meta, StoryObj } from '@storybook/angular';
import { DynamicRecursiveFormComponent } from './dynamic-recursive-form.component';
import { buildFormFromSchema } from '../core/dynamic-recursive-forms-builder';
import { DUConfigSchema, sampleValue } from '../types/examples/complex-oai'

const meta: Meta<DynamicRecursiveFormComponent> = {
  title: 'ng-form-foundry/DynamicRecursiveFormComponent',
  component:DynamicRecursiveFormComponent,
};
export default meta;

type Story = StoryObj<DynamicRecursiveFormComponent>;

export const complex: Story = ({
  name: "Complex Form",
  args: {
    schema: DUConfigSchema,
    initialValue: sampleValue,
  },
  render: (args) => {
    const formGroup = buildFormFromSchema(args.schema);
    return {
      props: {
        ...args,
        formGroup,
      },
      template: `
        <nff-dynamic-recursive-form
            [schema]="DUConfigSchema"
            [formGroup]="formGroup"
            [initialValue]="sampleValue"
        ></nff-dynamic-recursive-form>
      `,
    }
  }
});
