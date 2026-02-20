import { z } from 'zod';

const MAX_LABEL_LENGTH = 50;

export const trackWalletSchema = z.object({
  chainKey: z.enum(['ethereum_mainnet', 'solana_mainnet', 'tron_mainnet']),
  address: z.string().min(1),
  label: z
    .string()
    .max(MAX_LABEL_LENGTH)
    .nullish()
    .transform((v) => v ?? null),
});

export type TrackWalletDto = z.infer<typeof trackWalletSchema>;
