// eslint-disable-next-line import/no-cycle
import Bitloops from '..';
import { IInternalStorage } from '../definitions';
import { isBrowser } from '../helpers';
// eslint-disable-next-line import/no-cycle
import AuthClient from './AuthClient';
// eslint-disable-next-line import/no-cycle
import AuthServer from './AuthServer';
import { IAuthService } from './types';

export default class AuthFactory {
  static getInstance(bitloops: Bitloops, storage: IInternalStorage): IAuthService {
    if (isBrowser()) return new AuthClient(bitloops, storage);
    return new AuthServer(bitloops, storage);
  }
}
