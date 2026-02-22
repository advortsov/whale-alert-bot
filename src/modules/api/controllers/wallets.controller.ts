import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ChainKey } from '../../../common/interfaces/chain-key.interfaces';
import type { HistoryPageResult } from '../../whales/entities/history-page.interfaces';
import { HistoryRequestSource } from '../../whales/entities/history-rate-limiter.interfaces';
import { AlertFilterToggleTarget } from '../../whales/entities/tracking.interfaces';
import type {
  TelegramUserRef,
  WalletAlertFilterState,
} from '../../whales/entities/tracking.interfaces';
import type {
  IMuteWalletResult,
  ITrackWalletResult,
  IUnmuteWalletResult,
  IUntrackResult,
  IWalletDetailResult,
  IWalletListResult,
} from '../../whales/interfaces/tracking-wallets.result';
import { TrackingService } from '../../whales/services/tracking.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { type MuteWalletDto, muteWalletSchema } from '../dto/mute-wallet.dto';
import { type TrackWalletDto, trackWalletSchema } from '../dto/track-wallet.dto';
import { type WalletFilterDto, walletFilterSchema } from '../dto/wallet-filter.dto';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  HISTORY_PAGE_RESULT_SCHEMA,
  MUTE_WALLET_BODY_SCHEMA,
  MUTE_WALLET_RESULT_SCHEMA,
  TRACK_WALLET_BODY_SCHEMA,
  TRACK_WALLET_RESULT_SCHEMA,
  UNMUTE_WALLET_RESULT_SCHEMA,
  UNTRACK_RESULT_SCHEMA,
  WALLET_ALERT_FILTER_STATE_SCHEMA,
  WALLET_DETAIL_RESULT_SCHEMA,
  WALLET_FILTER_BODY_SCHEMA,
  WALLET_LIST_RESULT_SCHEMA,
} from '../swagger/api-schemas';

const CHAIN_KEY_MAP: Record<string, ChainKey> = {
  ethereum_mainnet: ChainKey.ETHEREUM_MAINNET,
  solana_mainnet: ChainKey.SOLANA_MAINNET,
  tron_mainnet: ChainKey.TRON_MAINNET,
};

@ApiTags('Wallets')
@ApiBearerAuth()
@Controller('api/wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  public constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track a new wallet' })
  @ApiBody({ schema: TRACK_WALLET_BODY_SCHEMA })
  @ApiResponse({ status: 201, description: 'Wallet tracked', schema: TRACK_WALLET_RESULT_SCHEMA })
  public async trackWallet(
    @CurrentUser() user: TelegramUserRef,
    @Body(new ZodValidationPipe(trackWalletSchema)) body: TrackWalletDto,
  ): Promise<ITrackWalletResult> {
    const chainKey: ChainKey = CHAIN_KEY_MAP[body.chainKey] ?? ChainKey.ETHEREUM_MAINNET;
    return this.trackingService.trackWallet(user, body.address, body.label, chainKey);
  }

  @Get()
  @ApiOperation({ summary: 'List tracked wallets' })
  @ApiResponse({ status: 200, description: 'Wallet list', schema: WALLET_LIST_RESULT_SCHEMA })
  public async listWallets(@CurrentUser() user: TelegramUserRef): Promise<IWalletListResult> {
    return this.trackingService.listWallets(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get wallet details' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet detail', schema: WALLET_DETAIL_RESULT_SCHEMA })
  public async getWalletDetails(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IWalletDetailResult> {
    return this.trackingService.getWalletDetail(user, `#${String(id)}`);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove tracked wallet' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet removed', schema: UNTRACK_RESULT_SCHEMA })
  public async removeWallet(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IUntrackResult> {
    return this.trackingService.removeWallet(user, id);
  }

  @Post(':id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mute wallet alerts' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiBody({ schema: MUTE_WALLET_BODY_SCHEMA })
  @ApiResponse({ status: 200, description: 'Wallet muted', schema: MUTE_WALLET_RESULT_SCHEMA })
  public async muteWallet(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(muteWalletSchema)) body: MuteWalletDto,
  ): Promise<IMuteWalletResult> {
    return this.trackingService.muteWallet(user, `#${String(id)}`, body.minutes, 'api');
  }

  @Delete(':id/mute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unmute wallet alerts' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiResponse({ status: 200, description: 'Wallet unmuted', schema: UNMUTE_WALLET_RESULT_SCHEMA })
  public async unmuteWallet(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<IUnmuteWalletResult> {
    return this.trackingService.unmuteWallet(user, `#${String(id)}`);
  }

  @Get(':id/filters')
  @ApiOperation({ summary: 'Get wallet alert filters' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiResponse({
    status: 200,
    description: 'Filter state',
    schema: WALLET_ALERT_FILTER_STATE_SCHEMA,
  })
  public async getWalletFilters(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<WalletAlertFilterState> {
    return this.trackingService.getWalletAlertFilterState(user, `#${String(id)}`);
  }

  @Patch(':id/filters')
  @ApiOperation({ summary: 'Update wallet alert filters' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiBody({ schema: WALLET_FILTER_BODY_SCHEMA })
  @ApiResponse({
    status: 200,
    description: 'Updated filter state',
    schema: WALLET_ALERT_FILTER_STATE_SCHEMA,
  })
  public async updateWalletFilters(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(walletFilterSchema)) body: WalletFilterDto,
  ): Promise<WalletAlertFilterState> {
    const target: AlertFilterToggleTarget =
      body.target === 'transfer' ? AlertFilterToggleTarget.TRANSFER : AlertFilterToggleTarget.SWAP;
    return this.trackingService.setWalletEventTypeFilter(
      user,
      `#${String(id)}`,
      target,
      body.enabled,
    );
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiParam({ name: 'id', type: 'integer', description: 'Wallet ID' })
  @ApiQuery({ name: 'limit', required: false, type: 'integer', description: 'Page size' })
  @ApiQuery({ name: 'offset', required: false, type: 'integer', description: 'Offset' })
  @ApiQuery({ name: 'kind', required: false, enum: ['all', 'eth', 'erc20'] })
  @ApiQuery({ name: 'direction', required: false, enum: ['all', 'in', 'out'] })
  @ApiResponse({ status: 200, description: 'History page', schema: HISTORY_PAGE_RESULT_SCHEMA })
  public async getWalletHistory(
    @CurrentUser() user: TelegramUserRef,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, string>,
  ): Promise<HistoryPageResult> {
    return this.trackingService.getAddressHistoryPageWithPolicy(user, {
      rawAddress: `#${String(id)}`,
      rawLimit: query['limit'] ?? null,
      rawOffset: query['offset'] ?? null,
      source: HistoryRequestSource.COMMAND,
      rawKind: query['kind'] ?? null,
      rawDirection: query['direction'] ?? null,
    });
  }
}
