import type { Message } from 'telegraf/typings/core/types/typegram';

import type { RuntimeStatusService } from '../../runtime/runtime-status.service';
import type { TrackingService } from '../../tracking/tracking.service';
import type { ReplyOptions } from '../telegram.interfaces';

export type HarnessUser = {
  readonly telegramId: string;
  readonly username: string | null;
};

export type HarnessReply = {
  readonly text: string;
  readonly options: ReplyOptions | null;
};

export type HarnessCallbackAnswer = {
  readonly text: string;
};

export type HarnessSendTextInput = {
  readonly user: HarnessUser;
  readonly text: string;
};

export type HarnessSendCallbackInput = {
  readonly user: HarnessUser;
  readonly callbackData: string;
};

export type HarnessRunResult = {
  readonly replies: readonly HarnessReply[];
  readonly callbackAnswers: readonly HarnessCallbackAnswer[];
  readonly outboundMessages: readonly Message.TextMessage[];
};

export type LocalBotHarnessDependencies = {
  readonly trackingService: TrackingService;
  readonly runtimeStatusService: RuntimeStatusService;
};
