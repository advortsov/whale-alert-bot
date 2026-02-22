import React from 'react';
import { Badge, Button, Card, Cell } from '@telegram-apps/telegram-ui';
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
    <Card className="tma-wallet-card">
      <Cell
        subhead={<ChainBadge chainKey={wallet.chainKey} />}
        titleBadge={
          <Badge type="number" mode="gray">
            #{wallet.walletId}
          </Badge>
        }
        subtitle={formatShortAddress(wallet.address)}
        before={
          <span className="tma-chain-avatar">
            <ChainIcon chainKey={wallet.chainKey} />
          </span>
        }
        after={null}
      >
        {wallet.label ?? `Кошелёк #${wallet.walletId}`}
      </Cell>
      <div className="tma-wallet-card-actions">
        <Button
          mode="outline"
          size="s"
          onClick={(): void => {
            void navigate(`/wallets/${wallet.walletId}`);
          }}
        >
          Открыть
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
    </Card>
  );
};
