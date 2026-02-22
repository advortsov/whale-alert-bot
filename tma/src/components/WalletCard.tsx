import React from 'react';
import { Badge, Button, Card, Cell } from '@telegram-apps/telegram-ui';
import { Link } from 'react-router-dom';

import { formatShortAddress } from '../utils/format';
import { ChainBadge } from './ChainBadge';
import { ChainIcon } from './ChainIcon';
import type { IWalletSummaryDto } from '../types/api.types';

interface IWalletCardProps {
  readonly wallet: IWalletSummaryDto;
}

export const WalletCard = ({ wallet }: IWalletCardProps): React.JSX.Element => {
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
        after={
          <Link to={`/wallets/${wallet.walletId}`} className="tma-link-reset">
            <Button mode="outline" size="s">
              Открыть
            </Button>
          </Link>
        }
      >
        {wallet.label ?? `Кошелёк #${wallet.walletId}`}
      </Cell>
    </Card>
  );
};
