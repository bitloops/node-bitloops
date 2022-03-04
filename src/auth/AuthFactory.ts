import { BitloopsConfig, IInternalStorage } from '../definitions';
import { isBrowser } from '../helpers';
import HTTP from '../HTTP';
import ServerSentEvents from '../Subscriptions';
import AuthClient from './AuthClient';
import AuthServer from './AuthServer';
import { IAuthService } from './types';

export default class AuthFactory {
  static getInstance(
    http: HTTP,
    storage: IInternalStorage,
    subscriptions: ServerSentEvents,
    bitloopsConfig: BitloopsConfig,
  ): IAuthService {
    if (isBrowser()) return new AuthClient(subscriptions, storage, http, bitloopsConfig);
    return new AuthServer(storage, http, bitloopsConfig);
  }
}
