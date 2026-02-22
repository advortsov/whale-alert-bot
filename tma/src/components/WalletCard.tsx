import React from 'react';
import { Badge, Button, Card, Cell, Text } from '@telegram-apps/telegram-ui';
import { Link } from 'react-router-dom';

import { formatShortAddress } from '../utils/format';
import { ChainIcon } from './ChainIcon';
import type { IWalletSummaryDto } from '../types/api.types';

interface IWalletCardProps {
  readonly wallet: IWalletSummaryDto;
}

export const WalletCard = ({ wallet }: IWalletCardProps): React.JSX.Element => {
  return (
    <Card className="tma-wallet-card">
      <Cell
        subhead={
          <span className="tma-chain-inline">
            <ChainIcon chainKey={wallet.chainKey} />
            <Text>{wallet.chainKey}</Text>
          </span>
        }
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
