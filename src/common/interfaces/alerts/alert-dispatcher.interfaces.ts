import type { ClassifiedEvent } from '../chain.types';

export interface IAlertDispatcher {
  dispatch(event: ClassifiedEvent): Promise<void>;
}
