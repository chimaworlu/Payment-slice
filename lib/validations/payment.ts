import { z } from 'zod';

export const checkoutSchema = z.object({
  interval: z.enum(['MONTHLY', 'YEARLY'], 'interval must be either MONTHLY or YEARLY'),
});

export const upgradeSchema = z.object({
  targetInterval: z.enum(['YEARLY'], 'targetInterval must be YEARLY'),
});

export const downgradeSchema = z.object({
  targetInterval: z.enum(['MONTHLY'], 'targetInterval must be MONTHLY'),
});
