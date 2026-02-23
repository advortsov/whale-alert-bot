import React from 'react';
import { Button, Cell } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';

import { formatShortAddress } from '../utils/format';
import { ChainBadge } from './ChainBadge';
import { ChainIcon } from './ChainIcon';
import type { IWalletSummaryDto } from '../types/api.types';

interface IWalletCardProps {
  readonly wallet: IWalletSummaryDto;
}

export const WalletCard = ({ wallet }: IWalletCardProps): React.JSX.Element => {
  const navigate = useNavigate();

  return (
    <article className="tma-wallet-card">
      <Cell
        subhead={<ChainBadge chainKey={wallet.chainKey} />}
        subtitle={formatShortAddress(wallet.address)}
        before={
          <span className="tma-chain-avatar">
            <ChainIcon chainKey={wallet.chainKey} />
          </span>
        }
        after={null}
        onClick={(): void => {
          void navigate(`/wallets/${wallet.walletId}`);
        }}
      >
        {wallet.label ?? 'Без label'}
      </Cell>
      <div className="tma-wallet-card-actions">
        <Button
          mode="outline"
          size="s"
          onClick={(): void => {
            void navigate(`/wallets/${wallet.walletId}`);
          }}
        >
          Детали
        </Button>
        <Button
          mode="bezeled"
          size="s"
          onClick={(): void => {
            void navigate(`/wallets/${wallet.walletId}#history`);
          }}
        >
          История
        </Button>
      </div>
    </article>
  );
};
