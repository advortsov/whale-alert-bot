import React from 'react';
import { Link } from 'react-router-dom';

import { formatShortAddress } from '../utils/format';
import { ChainIcon } from './ChainIcon';
import type { IWalletItem } from '../types/api.types';

interface IWalletCardProps {
  readonly wallet: IWalletItem;
}

export const WalletCard = ({ wallet }: IWalletCardProps): React.JSX.Element => {
  return (
    <article style={{ border: '1px solid var(--tg-theme-hint-color, #5b5b5b)', padding: 12, borderRadius: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>
          <ChainIcon chainKey={wallet.chainKey} /> {wallet.label ?? `#${wallet.id}`}
        </strong>
        {wallet.mutedUntil !== null ? <span>🔕 muted</span> : null}
      </header>
      <p style={{ margin: '8px 0' }}>{formatShortAddress(wallet.address)}</p>
      <Link to={`/wallets/${wallet.id}`}>Открыть</Link>
    </article>
  );
};
