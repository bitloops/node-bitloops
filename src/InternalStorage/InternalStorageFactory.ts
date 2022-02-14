import { isBrowser } from '../helpers';
import CredentialsStorage from './CredentialsStorage';
import { IInternalStorage } from '../definitions';
import LocalStorage from './LocalStorage';

export default class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    return new CredentialsStorage();
  }
}
