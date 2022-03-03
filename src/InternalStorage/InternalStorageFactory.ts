import { isBrowser, isGoogleServerless } from '../helpers';
import { IInternalStorage } from '../definitions';
import LocalStorage from './LocalStorage';
import GhostStorage from './GhostStorage';

export default class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    if (isGoogleServerless()) return new GhostStorage();
    // eslint-disable-next-line global-require
    const CredentialsStorage = require('./CredentialsStorage'); // TODO change it to use async import
    const CredStor = CredentialsStorage.default;
    const cs = new CredStor();
    return cs;
  }
}
