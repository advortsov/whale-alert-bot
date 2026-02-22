export const formatShortAddress = (address: string | null | undefined): string => {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return '—';
  }

  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
