import { isBrowser } from '../helpers';
import GlobalObject from './GlobalObject';
import { IInternalStorage } from '../definitions';
import LocalStorage from './LocalStorage';

export default class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    return new GlobalObject();
  }
}
