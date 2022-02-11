import { isBrowser } from './../helpers';
import { GlobalObject } from './GlobalObject';
import { IInternalStorage } from '../definitions';
import { LocalStorage } from './LocalStorage';

export class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    else return new GlobalObject();
  }
}
