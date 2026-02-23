import React from 'react';
import { Cell, Switch } from '@telegram-apps/telegram-ui';

interface IFilterToggleProps {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (nextValue: boolean) => void;
}

export const FilterToggle = ({ label, value, onChange }: IFilterToggleProps): React.JSX.Element => {
  return (
    <Cell
      multiline
      after={
        <Switch
          checked={value}
          onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
            onChange(event.target.checked);
          }}
        />
      }
    >
      {label}
    </Cell>
  );
};
