import { type PipeTransform, BadRequestException } from '@nestjs/common';
import { type z } from 'zod';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  public constructor(private readonly schema: z.ZodType<T>) {}

  public transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const formatted: string = result.error.issues
        .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Validation failed: ${formatted}`);
    }

    return result.data;
  }
}
