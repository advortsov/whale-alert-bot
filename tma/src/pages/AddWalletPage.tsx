import React, { useEffect, useState } from 'react';
import {
  Button,
  FixedLayout,
  Input,
  List,
  Placeholder,
  Section,
  Select,
  Title,
} from '@telegram-apps/telegram-ui';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { addWallet } from '../api/wallets';
import { useAuth } from '../hooks/useAuth';
import type { ITrackWalletRequest, ITrackWalletResult } from '../types/api.types';
import { getTelegramWebApp } from '../utils/telegram-webapp';

const DEFAULT_CHAIN_KEY: string = 'ethereum_mainnet';

export const AddWalletPage = (): React.JSX.Element => {
  const { apiClient } = useAuth();
  const navigate = useNavigate();
  const [chainKey, setChainKey] = useState<string>(DEFAULT_CHAIN_KEY);
  const [address, setAddress] = useState<string>('');
  const [label, setLabel] = useState<string>('');

  useEffect((): (() => void) => {
    const webApp = getTelegramWebApp();
    const backButton = webApp?.BackButton;

    if (backButton === undefined) {
      return (): void => undefined;
    }

    const handleBackClick = (): void => {
      void navigate('/wallets');
    };

    backButton.show();
    backButton.onClick(handleBackClick);

    return (): void => {
      backButton.offClick(handleBackClick);
      backButton.hide();
    };
  }, [navigate]);

  const addWalletMutation = useMutation({
    mutationFn: async (payload: ITrackWalletRequest): Promise<ITrackWalletResult> => {
      return addWallet(apiClient, payload);
    },
    onSuccess: (wallet: ITrackWalletResult): void => {
      void navigate(`/wallets/${wallet.walletId}`);
    },
  });

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const payload: ITrackWalletRequest = {
      chainKey,
      address,
      label,
    };

    void addWalletMutation.mutateAsync(payload);
  };

  return (
    <section className="tma-screen">
      <form onSubmit={onSubmit} className="tma-add-wallet-form">
        <List>
          <Section>
            <Title level="2" weight="2">
              Добавить кошелёк
            </Title>
            <Button
              mode="plain"
              size="s"
              className="tma-back-link-button"
              onClick={(): void => {
                void navigate('/wallets');
              }}
            >
              ← Назад
            </Button>
          </Section>
          <Section>
            <Select
              header="Сеть"
              value={chainKey}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>): void => {
                setChainKey(event.target.value);
              }}
            >
              <option value="ethereum_mainnet">ETH</option>
              <option value="solana_mainnet">SOL</option>
              <option value="tron_mainnet">TRON</option>
            </Select>
            <Input
              header="Адрес"
              value={address}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
                setAddress(event.target.value);
              }}
              placeholder="Вставь адрес кошелька"
            />
            <Input
              header="Label"
              value={label}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
                setLabel(event.target.value);
              }}
              placeholder="Необязательно"
            />
          </Section>
          {addWalletMutation.isError ? (
            <Section>
              <Placeholder
                header="Не удалось добавить кошелёк"
                description="Проверь адрес и попробуй снова."
              />
            </Section>
          ) : null}
        </List>
        <FixedLayout vertical="bottom" className="tma-fixed-action">
          <Button
            mode="filled"
            size="m"
            stretched
            type="submit"
            disabled={addWalletMutation.isPending}
          >
            {addWalletMutation.isPending ? 'Добавляю…' : 'Добавить'}
          </Button>
        </FixedLayout>
      </form>
    </section>
  );
};
