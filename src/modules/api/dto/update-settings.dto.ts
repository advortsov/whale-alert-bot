import { z } from 'zod';

import { AlertCexFlowMode } from '../../whales/entities/cex-flow.interfaces';
import { AlertSmartFilterType } from '../../whales/entities/smart-filter.interfaces';

export const updateSettingsSchema = z
  .object({
    thresholdUsd: z.number().min(0).optional(),
    mutedMinutes: z.number().int().min(0).nullable().optional(),
    cexFlowMode: z.enum(AlertCexFlowMode).optional(),
    smartFilterType: z.enum(AlertSmartFilterType).optional(),
    includeDexes: z.array(z.string()).optional(),
    excludeDexes: z.array(z.string()).optional(),
    quietHoursFrom: z.string().nullable().optional(),
    quietHoursTo: z.string().nullable().optional(),
    timezone: z.string().optional(),
    allowTransfer: z.boolean().optional(),
    allowSwap: z.boolean().optional(),
  })
  .refine((obj) => Object.values(obj).some((v) => v !== undefined), {
    message: 'At least one setting field must be provided',
  });

export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;
