import { isBrowser, isGoogleServerless } from '../helpers';
// import CredentialsStorage from './CredentialsStorage';
import { IInternalStorage } from '../definitions';
import LocalStorage from './LocalStorage';
import GhostStorage from './GhostStorage';

// async function importModule(moduleName: string): Promise<any> {
//   console.log('importing ', moduleName);
//   const importedModule = await import(moduleName);
//   console.log('\timported ...');
//   return importedModule;
// }

export default class InternalStorageFactory {
  static getInstance(): IInternalStorage {
    if (isBrowser()) return new LocalStorage();
    console.log('isGoogleServerless()', isGoogleServerless());
    if (isGoogleServerless()) return new GhostStorage();
    // eslint-disable-next-line global-require
    const CredentialsStorage = require('./CredentialsStorage');
    // import CredentialsStorage = require('./CredentialsStorage');

    // const CredentialsStorage = await importModule('./CredentialsStorage');
    const CredStor = CredentialsStorage.default;
    const cs = new CredStor();
    // console.log('cs', cs);
    // console.log('CredentialsStorage', CredentialsStorage.default);
    // console.log();
    return cs;
    // return new CredentialsStorage();
  }
}
// const internalStorageFactory = InternalStorageFactory.getInstance();

// console.log('internalStorageFactory', internalStorageFactory);
