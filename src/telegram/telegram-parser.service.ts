import { Injectable } from '@nestjs/common';

import type { IParsedTrackArgs } from './telegram-parser.interfaces';
import {
  ALERT_FILTER_TARGET_MAP,
  MENU_BUTTON_COMMAND_MAP,
  SUPPORTED_COMMAND_MAP,
  TRACK_CHAIN_ALIAS_MAP,
} from './telegram.constants';
import { SupportedTelegramCommand, type ParsedMessageCommand } from './telegram.interfaces';
import { ChainKey } from '../common/interfaces/chain-key.interfaces';
import { AlertFilterToggleTarget } from '../modules/whales/entities/tracking.interfaces';

const TRACK_ARGS_WITH_LABEL_COUNT = 3;

@Injectable()
export class TelegramParserService {
  public parseMessageCommands(rawText: string): readonly ParsedMessageCommand[] {
    const lines: readonly string[] = rawText.split(/\r?\n/);
    const parsedCommands: ParsedMessageCommand[] = [];

    for (let lineIndex: number = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine: string = lines[lineIndex]?.trim() ?? '';

      if (rawLine.length === 0) {
        continue;
      }

      const menuCommand: SupportedTelegramCommand | null = this.resolveMenuButtonCommand(rawLine);

      if (menuCommand !== null) {
        parsedCommands.push({
          command: menuCommand,
          args: [],
          lineNumber: lineIndex + 1,
        });
        continue;
      }

      if (!rawLine.startsWith('/')) {
        continue;
      }

      const parsedCommand: ParsedMessageCommand | null = this.parseCommandLine(
        lines,
        lineIndex,
        rawLine,
      );

      if (parsedCommand !== null) {
        parsedCommands.push(parsedCommand);
      }

      const consumedTrackLines: number = this.resolveTrackConsumedLines(rawLine, parsedCommand);

      if (consumedTrackLines > 0) {
        lineIndex += consumedTrackLines;
      }
    }

    return parsedCommands;
  }

  public parseTrackArgs(args: readonly string[]): IParsedTrackArgs | null {
    if (args.length < 2) {
      return null;
    }

    const firstArgCandidate: string | undefined = args[0];
    const addressCandidate: string | undefined = args[1];

    if (!firstArgCandidate || !addressCandidate) {
      return null;
    }

    const chainKeyByAlias: ChainKey | null = this.resolveTrackChainAlias(firstArgCandidate);

    if (chainKeyByAlias === null) {
      return null;
    }

    const address: string = addressCandidate.trim();
    const labelRaw: string | null = args.length > 2 ? args.slice(2).join(' ') : null;
    const label: string | null = labelRaw && labelRaw.trim().length > 0 ? labelRaw.trim() : null;

    return {
      chainKey: chainKeyByAlias,
      address,
      label,
    };
  }

  public parseOnOffState(rawState: string): boolean | null {
    const normalizedState: string = rawState.trim().toLowerCase();

    if (normalizedState === 'on') {
      return true;
    }

    if (normalizedState === 'off') {
      return false;
    }

    return null;
  }

  public resolveAlertFilterTarget(rawTarget: string): AlertFilterToggleTarget | null {
    const normalizedTarget: string = rawTarget.trim().toLowerCase();
    return ALERT_FILTER_TARGET_MAP[normalizedTarget] ?? null;
  }

  private parseCommandLine(
    lines: readonly string[],
    lineIndex: number,
    rawLine: string,
  ): ParsedMessageCommand | null {
    const parts: readonly string[] = rawLine.split(/\s+/);
    const commandToken: string | undefined = parts[0];

    if (!commandToken) {
      return null;
    }

    const commandWithMention: string = commandToken.slice(1);
    const commandBase: string | undefined = commandWithMention.split('@')[0];

    if (!commandBase) {
      return null;
    }

    const command: SupportedTelegramCommand | null = this.resolveSupportedCommand(
      commandBase.toLowerCase(),
    );

    if (command === null) {
      return null;
    }

    return {
      command,
      args: this.resolveCommandArgs(command, parts.slice(1), lines, lineIndex),
      lineNumber: lineIndex + 1,
    };
  }

  private resolveCommandArgs(
    command: SupportedTelegramCommand,
    args: readonly string[],
    lines: readonly string[],
    lineIndex: number,
  ): readonly string[] {
    if (command !== SupportedTelegramCommand.TRACK) {
      return args;
    }

    const chainAliasToken: string | undefined = args[0];

    if (!chainAliasToken || this.resolveTrackChainAlias(chainAliasToken) === null) {
      return args;
    }

    if (args.length === 1) {
      const addressToken: string = this.readPlainLine(lines, lineIndex + 1);

      if (addressToken.length === 0) {
        return args;
      }

      const labelToken: string = this.readPlainLine(lines, lineIndex + 2);
      return labelToken.length > 0
        ? [chainAliasToken, addressToken, labelToken]
        : [chainAliasToken, addressToken];
    }

    if (args.length === 2) {
      const labelToken: string = this.readPlainLine(lines, lineIndex + 1);
      return labelToken.length > 0 ? [chainAliasToken, args[1] ?? '', labelToken] : args;
    }

    return args;
  }

  private resolveTrackConsumedLines(
    rawLine: string,
    parsedCommand: ParsedMessageCommand | null,
  ): number {
    if (parsedCommand === null || parsedCommand.command !== SupportedTelegramCommand.TRACK) {
      return 0;
    }

    const inlineArgsCount: number = Math.max(rawLine.split(/\s+/).length - 1, 0);
    const consumedLines: number = parsedCommand.args.length - inlineArgsCount;

    if (consumedLines <= 0) {
      return 0;
    }

    return Math.min(consumedLines, TRACK_ARGS_WITH_LABEL_COUNT - 1);
  }

  private readPlainLine(lines: readonly string[], lineIndex: number): string {
    const line: string = lines[lineIndex]?.trim() ?? '';
    return line.length > 0 && !line.startsWith('/') ? line : '';
  }

  private resolveSupportedCommand(commandName: string): SupportedTelegramCommand | null {
    return SUPPORTED_COMMAND_MAP[commandName] ?? null;
  }

  private resolveMenuButtonCommand(buttonText: string): SupportedTelegramCommand | null {
    return MENU_BUTTON_COMMAND_MAP[buttonText] ?? null;
  }

  private resolveTrackChainAlias(rawChainAlias: string): ChainKey | null {
    const normalizedAlias: string = rawChainAlias.trim().toLowerCase();
    return TRACK_CHAIN_ALIAS_MAP[normalizedAlias] ?? null;
  }
}
