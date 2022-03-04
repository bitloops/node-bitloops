import { BitloopsConfig, IInternalStorage } from '../definitions';
import { isBrowser } from '../helpers';
import ServerSentEvents from '../Subscriptions';
import AuthClient from './AuthClient';
import AuthServer from './AuthServer';
import { IAuthService } from './types';

export default class AuthFactory {
  static getInstance(
    storage: IInternalStorage,
    subscriptions: ServerSentEvents,
    bitloopsConfig: BitloopsConfig,
  ): IAuthService {
    if (isBrowser()) return new AuthClient(subscriptions, storage, bitloopsConfig);
    return new AuthServer(storage, bitloopsConfig);
  }
}
