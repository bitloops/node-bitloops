import { AuthTypes, BitloopsConfig } from './index';
import { AuthenticationOptionsType } from '.';

type BitloopsUser = {};
class auth {
  private static authOptions?: AuthenticationOptionsType;
  private static bitloopsConfig: BitloopsConfig;

  static setAuthOptions(options?: AuthenticationOptionsType) {
    auth.authOptions = options;
  }

  static setBitloopsConfig(config: BitloopsConfig) {
    auth.bitloopsConfig = config;
  }

  static authenticateWithGoogle() {
    if (this.authOptions?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');

    const url = `${this.bitloopsConfig.ssl === false ? 'http' : 'https'}://${
      this.bitloopsConfig.server
    }/bitloops/auth/google?client_id${this.authOptions.clientId}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  registerWithGoogle() {}
  getUser() {}
  clear() {}

  onAuthStateChange(authChangeCb: (user: BitloopsUser) => void) {}
  //   onAuthStateChange(user: BitloopsUser) {
  //     if (user) {
  //       // Do stuff when authenticated
  //     } else {
  //       // Do stuff if authentication is cleared
  //     }
  //   }
}

export default auth;
