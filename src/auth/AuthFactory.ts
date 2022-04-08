import { BitloopsConfig, IInternalStorage } from '../definitions';
import { isBrowser } from '../helpers';
import HTTP from '../HTTP';
import ServerSentEvents from '../Subscriptions';
import AuthClient from './AuthClient';
import { IAuthService } from './types';

export default class AuthFactory {
  static getInstance(
    http: HTTP,
    storage: IInternalStorage,
    subscriptions: ServerSentEvents,
    bitloopsConfig: BitloopsConfig,
  ): IAuthService {
    if (isBrowser()) return new AuthClient(subscriptions, storage, http, bitloopsConfig);
    // eslint-disable-next-line global-require
    const authServerPath = './AuthServer';
    const AuthServer = require(authServerPath).default; // TODO change it to use async import
    return new AuthServer(storage, http, bitloopsConfig);
  }
}
