import { useContext } from 'react';

import { AuthContext, type IAuthContextValue } from '../providers/AuthProvider';

export const useAuth = (): IAuthContextValue => {
  return useContext(AuthContext);
};
