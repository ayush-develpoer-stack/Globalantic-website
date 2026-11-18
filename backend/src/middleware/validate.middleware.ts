import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

/**
 * Validates and coerces req.body / req.query / req.params against a Zod schema.
 * The parsed (typed, stripped) result replaces the original values.
 */
export function validate(schema: Schema, source: 'body' | 'query' | 'params' = 'body') {
  const middleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync(req[source]);
      // req.query/params are read-only getters in some Express versions; assign safely.
      if (source === 'body') {
        req.body = parsed;
      } else {
        Object.assign(req[source], parsed);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
  // Read by scripts/api-inventory.ts to document request fields.
  return Object.assign(middleware, { schema, source });
}
