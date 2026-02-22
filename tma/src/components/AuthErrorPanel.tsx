import React from 'react';
import { Button, Placeholder, Text } from '@telegram-apps/telegram-ui';

interface IAuthErrorPanelProps {
  readonly message: string;
}

export const AuthErrorPanel = ({ message }: IAuthErrorPanelProps): React.JSX.Element => {
  return (
    <section className="tma-screen tma-screen-centered">
      <Placeholder
        header="Mini App не запустился"
        description={
          <Text>
            Открой бота, отправь <strong>/app</strong> и нажми кнопку{' '}
            <strong>📱 Открыть приложение</strong>.
          </Text>
        }
      >
        <Text>{message}</Text>
        <Button
          mode="filled"
          stretched
          size="m"
          onClick={(): void => {
            window.location.reload();
          }}
        >
          Повторить
        </Button>
      </Placeholder>
    </section>
  );
};
