import { z } from 'zod';

export const walletFilterSchema = z.object({
  target: z.enum(['transfer', 'swap']),
  enabled: z.boolean(),
});

export type WalletFilterDto = z.infer<typeof walletFilterSchema>;
