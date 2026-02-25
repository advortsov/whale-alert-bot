import React from 'react';
import {
  Button,
  Cell,
  List,
  Placeholder,
  Section,
  Spinner,
  Text,
  Title,
} from '@telegram-apps/telegram-ui';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { loadWalletById, loadWalletHistory, muteWallet, unmuteWallet } from '../api/wallets';
import { ChainBadge } from '../components/ChainBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import type { IWalletDetailDto, IWalletHistoryResult } from '../types/api.types';
import { formatShortAddress } from '../utils/format';
import { openExternalLink } from '../utils/telegram-webapp';

const DEFAULT_HISTORY_OFFSET: number = 0;
const DEFAULT_HISTORY_LIMIT: number = 20;
const CHAIN_NAME_BY_KEY: Record<string, string> = {
  ethereum_mainnet: 'Ethereum',
  solana_mainnet: 'Solana',
  tron_mainnet: 'TRON',
};

const normalizeHistoryToken = (
  rawValue: string | null | undefined,
  fallbackValue: string,
): string => {
  if (typeof rawValue !== 'string') {
    return fallbackValue;
  }

  const normalizedValue: string = rawValue.trim().toUpperCase();
  return normalizedValue.length > 0 ? normalizedValue : fallbackValue;
};

const buildHistoryBadgeLine = (item: IWalletHistoryResult['items'][number]): string => {
  const direction: string = normalizeHistoryToken(item.direction, 'UNKNOWN');
  const flowLabel: string = normalizeHistoryToken(
    item.flowLabel,
    normalizeHistoryToken(item.flowType, 'UNKNOWN'),
  );
  const assetStandard: string = normalizeHistoryToken(item.assetStandard, 'UNKNOWN');
  const statusToken: string = item.isError ? '[ERROR]' : '[OK]';
  const usdToken: string =
    item.usdAmount !== null && item.usdPrice !== null
      ? `[USD: ${item.usdAmount.toFixed(2)}]`
      : item.usdUnavailable
        ? '[USD: n/a]'
        : '[USD: pending]';

  return [
    `[${direction}]`,
    `[${flowLabel}]`,
    `[${assetStandard}]`,
    statusToken,
    usdToken,
  ].join(' ');
};

const buildHistoryTitleLine = (item: IWalletHistoryResult['items'][number]): string => {
  const txType: string = normalizeHistoryToken(
    item.txType,
    normalizeHistoryToken(item.eventType, 'UNKNOWN'),
  );

  if (
    txType === 'SWAP' &&
    item.swapFromSymbol !== null &&
    item.swapToSymbol !== null &&
    item.swapFromAmountText !== null &&
    item.swapToAmountText !== null
  ) {
    return `${txType} • ${item.swapFromAmountText} ${item.swapFromSymbol} → ${item.swapToAmountText} ${item.swapToSymbol}`;
  }

  if (txType === 'SWAP' && normalizeHistoryToken(item.amountText, 'SWAP') === 'SWAP') {
    return item.dex !== null ? `${txType} • ${item.dex}` : txType;
  }

  return `${txType} • ${item.amountText}`;
};

export const WalletDetailPage = (): React.JSX.Element => {
  const params = useParams();
  const walletId: number = Number.parseInt(params.id ?? '', 10);
  const { apiClient, isReady } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionStatus, setActionStatus] = React.useState<string | null>(null);

  const walletQuery: UseQueryResult<IWalletDetailDto> = useQuery<IWalletDetailDto>({
    queryKey: ['wallet', walletId],
    queryFn: async (): Promise<IWalletDetailDto> => {
      return loadWalletById(apiClient, walletId);
    },
    enabled: isReady && Number.isInteger(walletId),
  });

  const historyQuery = useInfiniteQuery({
    queryKey: ['wallet-history', walletId],
    queryFn: async ({ pageParam }): Promise<IWalletHistoryResult> => {
      return loadWalletHistory(apiClient, walletId, pageParam, DEFAULT_HISTORY_LIMIT);
    },
    initialPageParam: DEFAULT_HISTORY_OFFSET,
    getNextPageParam: (lastPage: IWalletHistoryResult): number | null => {
      return lastPage.nextOffset;
    },
    enabled: isReady && Number.isInteger(walletId) && walletQuery.isSuccess,
  });

  const muteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await muteWallet(apiClient, walletId, 24 * 60);
    },
    onSuccess: async (): Promise<void> => {
      setActionStatus('Кошелёк замьючен на 24 часа.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', walletId] }),
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['tma-init'] }),
      ]);
    },
    onError: (error: unknown): void => {
      const message: string = error instanceof Error ? error.message : 'Не удалось применить mute.';
      setActionStatus(message);
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await unmuteWallet(apiClient, walletId);
    },
    onSuccess: async (): Promise<void> => {
      setActionStatus('Mute снят.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', walletId] }),
        queryClient.invalidateQueries({ queryKey: ['wallets'] }),
        queryClient.invalidateQueries({ queryKey: ['tma-init'] }),
      ]);
    },
    onError: (error: unknown): void => {
      const message: string = error instanceof Error ? error.message : 'Не удалось снять mute.';
      setActionStatus(message);
    },
  });

  if (!Number.isInteger(walletId)) {
    return (
      <section className="tma-screen tma-screen-centered">
        <Placeholder header="Некорректный id кошелька" description="Проверь ссылку и повтори." />
      </section>
    );
  }

  if (walletQuery.isLoading) {
    return <LoadingSpinner />;
  }

  if (walletQuery.isError || walletQuery.data === undefined) {
    return (
      <section className="tma-screen tma-screen-centered">
        <Placeholder header="Не удалось загрузить карточку кошелька" />
      </section>
    );
  }

  const historyPages: readonly IWalletHistoryResult[] = historyQuery.data?.pages ?? [];
  const historyItems = historyPages.flatMap((page: IWalletHistoryResult) => page.items);
  const isMuted: boolean = walletQuery.data.activeMute !== null;
  const isActionPending: boolean = muteMutation.isPending || unmuteMutation.isPending;
  const hasNextHistoryPage: boolean = historyQuery.hasNextPage === true;
  const isHistoryFetching: boolean = historyQuery.isFetchingNextPage;
  const historyErrorMessage: string | null =
    historyQuery.error instanceof Error ? historyQuery.error.message : null;
  const walletTitle: string = walletQuery.data.label ?? 'Кошелёк';
  const walletSubtitle: string = formatShortAddress(walletQuery.data.address);
  const chainName: string =
    CHAIN_NAME_BY_KEY[walletQuery.data.chainKey] ?? walletQuery.data.chainKey;

  return (
    <section className="tma-screen">
      <List>
        <Section className="tma-wallet-detail-header">
          <Title level="2" weight="2">
            {walletTitle}
          </Title>
          <Text className="tma-wallet-detail-subtitle">{walletSubtitle}</Text>
          <ChainBadge chainKey={walletQuery.data.chainKey} />
        </Section>

        <Section header="Детали">
          <Cell subhead="Сеть">{chainName}</Cell>
          <Cell subhead="Адрес" multiline>
            {walletQuery.data.address}
          </Cell>
          <Cell subhead="Mute">
            {walletQuery.data.activeMute === null ? 'off' : walletQuery.data.activeMute}
          </Cell>
        </Section>

        <Section id="history" header={`История транзакций (${historyItems.length})`}>
          {historyQuery.isLoading ? (
            <div className="tma-history-loading">
              <Spinner size="m" />
            </div>
          ) : null}
          {historyQuery.isError ? (
            <Placeholder
              header="Не удалось загрузить историю"
              description={historyErrorMessage ?? 'Повтори запрос.'}
            >
              <Button
                mode="bezeled"
                size="s"
                onClick={(): void => {
                  void historyQuery.refetch();
                }}
              >
                Повторить
              </Button>
            </Placeholder>
          ) : null}
          {historyItems.length === 0 && !historyQuery.isError && !historyQuery.isLoading ? (
            <Placeholder header="Пока нет событий" />
          ) : (
            historyItems.map((item) => (
              <Cell
                key={`${item.txHash}-${item.occurredAt}`}
                subtitle={new Date(item.occurredAt).toLocaleString('ru-RU', { hour12: false })}
                after={
                  <Button
                    mode="plain"
                    size="s"
                    className="tma-tx-link-button"
                    disabled={item.txUrl.trim().length === 0}
                    onClick={(): void => {
                      if (item.txUrl.trim().length === 0) {
                        return;
                      }
                      openExternalLink(item.txUrl);
                    }}
                  >
                    Tx
                  </Button>
                }
              >
                <div className="tma-history-title">
                  {buildHistoryTitleLine(item)}
                </div>
                <div className="tma-history-badges">{buildHistoryBadgeLine(item)}</div>
              </Cell>
            ))
          )}
          {hasNextHistoryPage ? (
            <Button
              mode="bezeled"
              size="m"
              stretched
              disabled={isHistoryFetching}
              onClick={(): void => {
                void historyQuery.fetchNextPage();
              }}
            >
              {isHistoryFetching ? <Spinner size="s" /> : 'Показать ещё'}
            </Button>
          ) : null}
        </Section>

        {actionStatus === null ? null : (
          <Section>
            <Text>{actionStatus}</Text>
          </Section>
        )}

        <Section>
          <div className="tma-actions">
            <Button
              type="button"
              mode={isMuted ? 'gray' : 'filled'}
              size="m"
              stretched
              disabled={isActionPending}
              onClick={(): void => {
                if (isMuted) {
                  unmuteMutation.mutate();
                  return;
                }

                muteMutation.mutate();
              }}
            >
              {isMuted ? 'Unmute' : 'Mute 24h'}
            </Button>
            <Button
              mode="bezeled"
              size="m"
              stretched
              onClick={(): void => {
                void historyQuery.refetch();
              }}
            >
              Обновить историю
            </Button>
            <Button
              mode="outline"
              size="m"
              stretched
              onClick={(): void => {
                void navigate('/wallets');
              }}
            >
              Назад к списку
            </Button>
          </div>
        </Section>
      </List>
    </section>
  );
};
