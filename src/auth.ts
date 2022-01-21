import { v4 as uuid } from 'uuid';
import { AuthTypes, BitloopsConfig, IBitloopsAuthenticationOptions } from './index';
import { AuthenticationOptionsType } from '.';
import Bitloops from './index';
import { BitloopsUser } from './definitions';

class auth {
  private static authOptions?: AuthenticationOptionsType;
  private static bitloopsConfig: BitloopsConfig;
  private static bitloops: Bitloops;
  private static authChangeCallback: ((user: BitloopsUser) => void) | null;

  static setBitloops(bitloops: Bitloops) {
    auth.bitloops = bitloops;
  }

  static setAuthOptions(options?: AuthenticationOptionsType) {
    auth.authOptions = options;
  }

  static setBitloopsConfig(config: BitloopsConfig) {
    auth.bitloopsConfig = config;
  }

  static authenticateWithGoogle() {
    if (auth.bitloops.authOptions?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');
    const sessionUuid = uuid();
    const url = `${auth.bitloops.config.ssl === false ? 'http' : 'https'}://${
      auth.bitloops.config.server
    }/bitloops/auth/google?client_id=${auth.bitloops.authOptions.clientId}&provider_id=${auth.bitloops.authOptions.providerId}&session_uuid=${sessionUuid}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      auth.bitloops.subscribe(`workflow-events.auth:${auth.bitloops.authOptions.providerId}:${sessionUuid}`, (user: BitloopsUser) => {
        if (auth.authChangeCallback) auth.authChangeCallback(user);
      })
    }
  }

  static clear() {
    const clearedAuthOptions = auth.bitloops.authOptions as IBitloopsAuthenticationOptions;
    // TODO communicate logout to REST 
    clearedAuthOptions.token = null;
    if (auth.authChangeCallback) auth.authChangeCallback(null);
    auth.bitloops.authOptions = clearedAuthOptions;
  }

  registerWithGoogle() {}
  getUser() {}

  static onAuthStateChange(authChangeCallback: (user: BitloopsUser) => void) {
    if (auth.bitloops.authOptions && auth.bitloops.authOptions.authenticationType === AuthTypes.User) {
      auth.authChangeCallback = authChangeCallback;
    } else {

    }
  }
}

export default auth;
