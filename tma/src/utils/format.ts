const SHORT_ADDRESS_MAX_LENGTH = 12;
const SHORT_ADDRESS_HEAD_LENGTH = 6;
const SHORT_ADDRESS_TAIL_LENGTH = 4;

export const formatShortAddress = (address: string | null | undefined): string => {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return '—';
  }

  if (address.length <= SHORT_ADDRESS_MAX_LENGTH) {
    return address;
  }

  return `${address.slice(0, SHORT_ADDRESS_HEAD_LENGTH)}...${address.slice(-SHORT_ADDRESS_TAIL_LENGTH)}`;
};
