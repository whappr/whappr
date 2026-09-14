import { zValidator as honoZValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';

export function zValidator<T extends ZodType>(target: 'json' | 'param' | 'query', schema: T) {
  return honoZValidator(target, schema, (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: result.error.issues.map((issue) => issue.message).join('; '),
      });
    }
  });
}
