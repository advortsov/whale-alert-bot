import type { Context } from 'telegraf';
import type { Message } from 'telegraf/typings/core/types/typegram';

import type { ReplyOptions } from '../telegram.interfaces';
import { TelegramUpdate } from '../telegram.update';
import type {
  HarnessCallbackAnswer,
  HarnessReply,
  HarnessRunResult,
  HarnessSendCallbackInput,
  HarnessSendTextInput,
  LocalBotHarnessDependencies,
} from './local-bot-harness.interfaces';

const INITIAL_MESSAGE_ID_COUNTER = 100;
const DEFAULT_LOCAL_USER_NAME = 'local-user';

export class LocalBotHarness {
  private readonly update: TelegramUpdate;
  private updateIdCounter: number = 1;
  private messageIdCounter: number = INITIAL_MESSAGE_ID_COUNTER;

  public constructor(dependencies: LocalBotHarnessDependencies) {
    this.update = new TelegramUpdate(
      dependencies.trackingService,
      dependencies.runtimeStatusService,
      dependencies.appConfigService,
    );
  }

  public async sendText(input: HarnessSendTextInput): Promise<HarnessRunResult> {
    const replyCollector: HarnessReply[] = [];
    const callbackAnswerCollector: HarnessCallbackAnswer[] = [];
    const outboundMessages: Message.TextMessage[] = [];
    const chatId: number = this.toNumericId(input.user.telegramId);
    const messageId: number = this.nextMessageId();

    const context: Context = {
      from: {
        id: chatId,
        is_bot: false,
        first_name: input.user.username ?? DEFAULT_LOCAL_USER_NAME,
        username: input.user.username ?? undefined,
      },
      chat: {
        id: chatId,
        type: 'private',
      },
      update: {
        update_id: this.nextUpdateId(),
      },
      message: {
        message_id: messageId,
        date: 0,
        chat: {
          id: chatId,
          type: 'private',
        },
        text: input.text,
      },
      reply: async (text: string, options?: ReplyOptions): Promise<Message.TextMessage> => {
        const sentMessageId: number = this.nextMessageId();
        const outboundMessage: Message.TextMessage = {
          message_id: sentMessageId,
          date: 0,
          chat: {
            id: chatId,
            type: 'private',
            first_name: input.user.username ?? DEFAULT_LOCAL_USER_NAME,
          },
          text,
        };
        replyCollector.push({
          text,
          options: options ?? null,
        });
        outboundMessages.push(outboundMessage);
        return outboundMessage;
      },
      answerCbQuery: async (text?: string): Promise<true> => {
        if (typeof text === 'string') {
          callbackAnswerCollector.push({ text });
        }
        return true;
      },
    } as unknown as Context;

    await this.update.onText(context);

    return {
      replies: replyCollector,
      callbackAnswers: callbackAnswerCollector,
      outboundMessages,
    };
  }

  public async sendCallback(input: HarnessSendCallbackInput): Promise<HarnessRunResult> {
    const replyCollector: HarnessReply[] = [];
    const callbackAnswerCollector: HarnessCallbackAnswer[] = [];
    const outboundMessages: Message.TextMessage[] = [];
    const chatId: number = this.toNumericId(input.user.telegramId);

    const context: Context = {
      from: {
        id: chatId,
        is_bot: false,
        first_name: input.user.username ?? DEFAULT_LOCAL_USER_NAME,
        username: input.user.username ?? undefined,
      },
      chat: {
        id: chatId,
        type: 'private',
      },
      update: {
        update_id: this.nextUpdateId(),
      },
      callbackQuery: {
        id: `cbq-${String(this.nextUpdateId())}`,
        from: {
          id: chatId,
          is_bot: false,
          first_name: input.user.username ?? DEFAULT_LOCAL_USER_NAME,
          username: input.user.username ?? undefined,
        },
        chat_instance: 'local-instance',
        data: input.callbackData,
      },
      reply: async (text: string, options?: ReplyOptions): Promise<Message.TextMessage> => {
        const sentMessageId: number = this.nextMessageId();
        const outboundMessage: Message.TextMessage = {
          message_id: sentMessageId,
          date: 0,
          chat: {
            id: chatId,
            type: 'private',
            first_name: input.user.username ?? DEFAULT_LOCAL_USER_NAME,
          },
          text,
        };
        replyCollector.push({
          text,
          options: options ?? null,
        });
        outboundMessages.push(outboundMessage);
        return outboundMessage;
      },
      answerCbQuery: async (text?: string): Promise<true> => {
        if (typeof text === 'string') {
          callbackAnswerCollector.push({ text });
        }
        return true;
      },
    } as unknown as Context;

    await this.update.onCallbackQuery(context);

    return {
      replies: replyCollector,
      callbackAnswers: callbackAnswerCollector,
      outboundMessages,
    };
  }

  private toNumericId(rawId: string): number {
    const parsedId: number = Number.parseInt(rawId, 10);
    return Number.isNaN(parsedId) ? 1 : parsedId;
  }

  private nextUpdateId(): number {
    const nextId: number = this.updateIdCounter;
    this.updateIdCounter += 1;
    return nextId;
  }

  private nextMessageId(): number {
    const nextId: number = this.messageIdCounter;
    this.messageIdCounter += 1;
    return nextId;
  }
}
