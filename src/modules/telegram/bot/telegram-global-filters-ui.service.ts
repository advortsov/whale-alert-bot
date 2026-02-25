import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';

import { GlobalDexFilterMode } from './telegram-global-filters-callback.interfaces';
import {
  GLOBAL_FILTERS_MODE_CALLBACK_PREFIX,
  GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE,
  GLOBAL_FILTERS_RESET_CALLBACK_PREFIX,
  GLOBAL_FILTERS_TOGGLE_CALLBACK_PREFIX,
} from './telegram.constants';
import type { ReplyOptions } from './telegram.interfaces';
import type { IUserSettingsResult } from '../../whales/interfaces/tracking-settings.result';

const GLOBAL_DEX_FILTER_OPTIONS: readonly string[] = [
  'uniswap',
  'curve',
  'sushiswap',
  'balancer',
  '1inch',
  'pancakeswap',
  'dodo',
  'other',
];

@Injectable()
export class TelegramGlobalFiltersUiService {
  public formatGlobalDexFiltersMessage(
    settingsResult: IUserSettingsResult,
    mode: GlobalDexFilterMode,
  ): string {
    const includeDexes: readonly string[] = settingsResult.settings.includeDexes;
    const excludeDexes: readonly string[] = settingsResult.settings.excludeDexes;

    return [
      '⚙️ Глобальные DEX-фильтры',
      `Режим редактирования: ${mode}`,
      `- include_dex: ${includeDexes.length > 0 ? includeDexes.join(', ') : 'all'}`,
      `- exclude_dex: ${excludeDexes.length > 0 ? excludeDexes.join(', ') : 'all'}`,
      '',
      'Нажми по DEX ниже, чтобы включить или выключить.',
    ].join('\n');
  }

  public buildGlobalDexFiltersInlineKeyboard(
    settingsResult: IUserSettingsResult,
    mode: GlobalDexFilterMode,
  ): ReplyOptions {
    const rows: InlineKeyboardButton.CallbackButton[][] = [];
    const selectedDexes: readonly string[] =
      mode === GlobalDexFilterMode.INCLUDE
        ? settingsResult.settings.includeDexes
        : settingsResult.settings.excludeDexes;
    const isIncludeMode: boolean = mode === GlobalDexFilterMode.INCLUDE;

    rows.push([
      {
        text: `${isIncludeMode ? '✅' : '▫️'} include`,
        callback_data: `${GLOBAL_FILTERS_MODE_CALLBACK_PREFIX}${GlobalDexFilterMode.INCLUDE}`,
      },
      {
        text: `${!isIncludeMode ? '✅' : '▫️'} exclude`,
        callback_data: `${GLOBAL_FILTERS_MODE_CALLBACK_PREFIX}${GlobalDexFilterMode.EXCLUDE}`,
      },
    ]);

    for (let index: number = 0; index < GLOBAL_DEX_FILTER_OPTIONS.length; index += 2) {
      const row: InlineKeyboardButton.CallbackButton[] = [];
      const firstDex: string | undefined = GLOBAL_DEX_FILTER_OPTIONS[index];
      const secondDex: string | undefined = GLOBAL_DEX_FILTER_OPTIONS[index + 1];

      if (typeof firstDex === 'string') {
        row.push(this.buildDexToggleButton(mode, selectedDexes, firstDex));
      }

      if (typeof secondDex === 'string') {
        row.push(this.buildDexToggleButton(mode, selectedDexes, secondDex));
      }

      rows.push(row);
    }

    rows.push([
      {
        text: '🧹 Сбросить',
        callback_data: `${GLOBAL_FILTERS_RESET_CALLBACK_PREFIX}${mode}`,
      },
      {
        text: '🔄 Обновить',
        callback_data: GLOBAL_FILTERS_REFRESH_CALLBACK_VALUE,
      },
    ]);

    return Markup.inlineKeyboard(rows);
  }

  private buildDexToggleButton(
    mode: GlobalDexFilterMode,
    selectedDexes: readonly string[],
    dexKey: string,
  ): InlineKeyboardButton.CallbackButton {
    const enabled: boolean = selectedDexes.includes(dexKey);
    const nextState: string = enabled ? 'off' : 'on';

    return {
      text: `${enabled ? '✅' : '☑️'} ${dexKey}`,
      callback_data: `${GLOBAL_FILTERS_TOGGLE_CALLBACK_PREFIX}${mode}:${dexKey}:${nextState}`,
    };
  }
}
