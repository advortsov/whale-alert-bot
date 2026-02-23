import React from 'react';
import {
  Button,
  Cell,
  List,
  Placeholder,
  Section,
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
import { openExternalLink } from '../utils/telegram-webapp';

const DEFAULT_HISTORY_OFFSET: number = 0;
const DEFAULT_HISTORY_LIMIT: number = 20;

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
      const message: string =
        error instanceof Error ? error.message : 'Не удалось применить mute.';
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
      const message: string =
        error instanceof Error ? error.message : 'Не удалось снять mute.';
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

  return (
    <section className="tma-screen">
      <List>
        <Section>
          <Title level="2" weight="2">
            Кошелёк {walletQuery.data.walletId}
          </Title>
          <ChainBadge chainKey={walletQuery.data.chainKey} />
          <Text>{walletQuery.data.label ?? 'Без label'}</Text>
        </Section>

        <Section header="Детали">
          <Cell subhead="Сеть">{walletQuery.data.chainKey}</Cell>
          <Cell subhead="Адрес" multiline>
            {walletQuery.data.address}
          </Cell>
          <Cell subhead="Mute">
            {walletQuery.data.activeMute === null ? 'off' : walletQuery.data.activeMute}
          </Cell>
        </Section>

        <section id="history">
          <Section header={`История транзакций (${historyItems.length})`}>
            {historyQuery.isLoading ? <Text>Загрузка истории…</Text> : null}
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
                      onClick={(): void => {
                        openExternalLink(item.txUrl);
                      }}
                    >
                      Tx
                    </Button>
                  }
                >
                  {item.eventType} • {item.direction} • {item.amountText}
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
                {isHistoryFetching ? 'Загрузка…' : 'Показать ещё'}
              </Button>
            ) : null}
          </Section>
        </section>

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
