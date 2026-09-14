import { z } from 'zod';

export const checkoutSchema = z.object({
  interval: z.enum(['MONTHLY', 'YEARLY'], 'interval must be either MONTHLY or YEARLY'),
});
