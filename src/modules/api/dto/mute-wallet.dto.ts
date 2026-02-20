import { z } from 'zod';

export const muteWalletSchema = z.object({
  minutes: z.number().int().min(1).max(10_080),
});

export type MuteWalletDto = z.infer<typeof muteWalletSchema>;
