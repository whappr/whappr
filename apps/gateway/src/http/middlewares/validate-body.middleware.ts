import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';

export function validateBodyMiddleware<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: result.error.issues.map((issue) => issue.message).join('; '),
      });
    }
  });
}
