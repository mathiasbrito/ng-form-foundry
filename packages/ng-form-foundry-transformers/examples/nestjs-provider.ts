/**
 * Example: wiring the framework-agnostic adapter into NestJS.
 *
 * This file is documentation, not part of the published build (it is excluded
 * from tsconfig and would need `@nestjs/common` to compile). It shows that the
 * NestJS integration is a thin wrapper over the plain `YangFormAdapter` — the
 * core stays framework-free.
 */
import { Module, Injectable } from '@nestjs/common';
import { YangFormAdapter, SubprocessEngine, InMemoryCache } from 'ng-form-foundry-transformers';

@Injectable()
export class YangFormService extends YangFormAdapter {
  constructor() {
    super(new SubprocessEngine(), new InMemoryCache());
  }
}

@Module({
  providers: [YangFormService],
  exports: [YangFormService],
})
export class YangFormModule {}

// A controller then delegates to the service:
//
//   @Get('models/:id/form-schema')
//   getSchema(@Param('id') id: string) { return this.yang.getFormSchema(id); }
//
//   @Put('models/:id')
//   save(@Param('id') id: string, @Body() value: FormValue) {
//     return this.yang.toYangData(value, id); // then RESTCONF PUT
//   }
