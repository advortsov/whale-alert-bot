import React from 'react';

interface IAuthErrorPanelProps {
  readonly message: string;
}

export const AuthErrorPanel = ({ message }: IAuthErrorPanelProps): React.JSX.Element => {
  return (
    <section className="screen-panel">
      <h1 className="screen-title">Mini App не запустился</h1>
      <p className="screen-text">{message}</p>
      <p className="screen-text">
        Открой бота и нажми <strong>/app</strong>, затем кнопку <strong>📱 Открыть приложение</strong>.
      </p>
    </section>
  );
};
