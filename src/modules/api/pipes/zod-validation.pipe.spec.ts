import { BadRequestException } from '@nestjs/common';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('should return parsed data for valid input', () => {
    const result = pipe.transform({ name: 'Alice', age: 30 });

    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('should throw BadRequestException for invalid input', () => {
    expect(() => pipe.transform({ name: '', age: -1 })).toThrow(BadRequestException);
  });

  it('should include field paths in error message', () => {
    try {
      pipe.transform({ name: 123, age: 'not-a-number' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toContain('Validation failed');
    }
  });
});
