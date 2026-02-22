import React, { useEffect, useState } from 'react';
import { Button, Input, Placeholder, Section, Title } from '@telegram-apps/telegram-ui';
import { useMutation, useQuery } from '@tanstack/react-query';

import { loadSettings, updateSettings } from '../api/settings';
import { FilterToggle } from '../components/FilterToggle';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import type { IUpdateSettingsRequest, IUserSettingsResult } from '../types/api.types';

export const SettingsPage = (): React.JSX.Element => {
  const { apiClient, isReady } = useAuth();
  const settingsQuery = useQuery<IUserSettingsResult>({
    queryKey: ['settings'],
    queryFn: async (): Promise<IUserSettingsResult> => {
      return loadSettings(apiClient);
    },
    enabled: isReady,
  });

  const [formState, setFormState] = useState<IUpdateSettingsRequest | null>(null);

  useEffect((): void => {
    if (settingsQuery.data === undefined) {
      return;
    }

    setFormState({
      thresholdUsd: settingsQuery.data.settings.thresholdUsd,
      quietHoursFrom: settingsQuery.data.settings.quietHoursFrom,
      quietHoursTo: settingsQuery.data.settings.quietHoursTo,
      timezone: settingsQuery.data.settings.timezone,
      cexFlowMode: settingsQuery.data.settings.cexFlowMode,
      smartFilterType: settingsQuery.data.settings.smartFilterType,
      includeDexes: settingsQuery.data.settings.includeDexes,
      excludeDexes: settingsQuery.data.settings.excludeDexes,
      allowTransfer: settingsQuery.data.preferences.allowTransfer,
      allowSwap: settingsQuery.data.preferences.allowSwap,
    });
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: async (payload: IUpdateSettingsRequest): Promise<IUserSettingsResult> => {
      return updateSettings(apiClient, payload);
    },
  });

  if (settingsQuery.isLoading || formState === null) {
    return <LoadingSpinner />;
  }

  if (settingsQuery.isError) {
    return (
      <section className="tma-screen tma-screen-centered">
        <Placeholder header="Не удалось загрузить настройки" description="Повтори попытку чуть позже." />
      </section>
    );
  }

  return (
    <section className="tma-screen">
      <Section>
        <Title level="2" weight="2">
          Настройки
        </Title>
      </Section>

      <Section>
        <Input
          type="number"
          header="Threshold USD"
          value={String(formState.thresholdUsd ?? 0)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            const parsed: number = Number.parseFloat(event.target.value);
            setFormState({
              ...formState,
              thresholdUsd: Number.isFinite(parsed) ? parsed : 0,
            });
          }}
        />
        <FilterToggle
          label="Transfer alerts"
          value={formState.allowTransfer}
          onChange={(nextValue: boolean): void => {
            setFormState({ ...formState, allowTransfer: nextValue });
          }}
        />
        <FilterToggle
          label="Swap alerts"
          value={formState.allowSwap}
          onChange={(nextValue: boolean): void => {
            setFormState({ ...formState, allowSwap: nextValue });
          }}
        />
      </Section>

      <Section>
        <Button
          type="button"
          mode="filled"
          size="m"
          stretched
          disabled={updateMutation.isPending}
          onClick={(): void => {
            void updateMutation.mutateAsync(formState);
          }}
        >
          Сохранить
        </Button>
        {updateMutation.isError ? (
          <Placeholder header="Ошибка" description="Не удалось сохранить настройки." />
        ) : null}
        {updateMutation.isSuccess ? <Placeholder header="Готово" description="Сохранено." /> : null}
      </Section>
    </section>
  );
};
