export const appendVersionQuery = (url: string, appVersion: string): string => {
  const version: string = appVersion.trim();

  if (version.length === 0) {
    return url;
  }

  const separator: string = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
};
