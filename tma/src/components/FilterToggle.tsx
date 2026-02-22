import React from 'react';

interface IFilterToggleProps {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (nextValue: boolean) => void;
}

export const FilterToggle = ({ label, value, onChange }: IFilterToggleProps): React.JSX.Element => {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>): void => {
          onChange(event.target.checked);
        }}
      />
    </label>
  );
};
