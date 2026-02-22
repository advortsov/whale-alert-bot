import React from 'react';
import { Placeholder, Spinner } from '@telegram-apps/telegram-ui';

export const LoadingSpinner = (): React.JSX.Element => {
  return (
    <section className="tma-screen tma-screen-centered">
      <Placeholder header="Whale Alert" description="Загружаю Mini App...">
        <Spinner size="l" />
      </Placeholder>
    </section>
  );
};
