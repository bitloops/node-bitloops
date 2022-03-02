import { isBrowser, isGoogleServerless } from '../helpers';
// import CredentialsStorage from './CredentialsStorage';
import { IInternalStorage } from '../definitions';
import LocalStorage from './LocalStorage';
import GhostStorage from './GhostStorage';

export default class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    console.log('isGoogleServerless()', isGoogleServerless());
    if (isGoogleServerless()) return new GhostStorage();
    // eslint-disable-next-line global-require
    const CredentialsStorage = require('./CredentialsStorage');
    return new CredentialsStorage();
  }
}
