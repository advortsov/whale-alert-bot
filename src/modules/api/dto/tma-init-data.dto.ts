import { z } from 'zod';

export const tmaInitDataSchema = z.object({
  initData: z.string().trim().min(1),
});

export type TmaInitDataDto = z.infer<typeof tmaInitDataSchema>;
