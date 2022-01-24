import { v4 as uuid } from 'uuid';
import { AuthTypes, AuthenticationOptionsType, BitloopsConfig, IBitloopsAuthenticationOptions, IAuthenticationOptions } from './definitions';
import Bitloops from './index';
import { BitloopsUser } from './definitions';
import axios from 'axios';

class auth {
  // private static authOptions?: AuthenticationOptionsType;
  // private static bitloopsConfig: BitloopsConfig;
  private static bitloops: Bitloops;
  private static authChangeCallback: ((user: BitloopsUser) => void) | null;

  static setBitloops(bitloops: Bitloops) {
    auth.bitloops = bitloops;
  }

  static setAuthOptions(options?: AuthenticationOptionsType) {
    sessionStorage.setItem('bitloops.auth.options', JSON.stringify(options));
    // auth.authOptions = options;
  }

  static authenticateWithGoogle() {
    const authOptionsString = sessionStorage.getItem('bitloops.auth.options');
    const authOptions = authOptionsString ? JSON.parse(authOptionsString) : null;
    if (authOptions?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');
    const configString = sessionStorage.getItem('bitloops.config');
    const config = configString ? JSON.parse(configString) : null;
    const sessionUuid = uuid();
    const url = `${config.ssl === false ? 'http' : 'https'}://${
      config.server
    }/bitloops/auth/google?client_id=${authOptions.clientId}&provider_id=${authOptions.providerId}&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      // Start a temporary subscription to receive information of the authentication being initiated on another tab
      const unsubscribe = auth.bitloops.subscribe(`workflow-events.auth:${authOptions.providerId}:${sessionUuid}`, async (user: BitloopsUser) => {
        // Store the callback function to use it in onAuthStateChange after the authentication process completes
        if (auth.authChangeCallback) auth.authChangeCallback(user);
        if (user) {
          // If there is user information then we store it in our localStorage
          localStorage.setItem('bitloops.auth.userData', JSON.stringify(user));
          // Unsubscribe from the temp subscription
          (await unsubscribe)();
          // If authChangeCallback was set before the user was authenticated and had a sessionState
          // we have to set the callback and sessionState subscription now that we do have a sessionState
          if (auth.authChangeCallback) {
            auth.onAuthStateChange(auth.authChangeCallback);
          }
        // Probably this is not needed any longer as we should only need it during logout
        // that will be heard by the long term onAuthStateChange subscription and not here
        // TODO after testing see if this is any longer required and see if we need to do error handling here
        // as user should be always set when this runs
        } else {
          localStorage.removeItem('bitloops.auth.userData');
        }
      })
    }
  }

  static async clearAuthentication() {
    // TODO communicate logout to REST 
    const user = auth.getUser() as BitloopsUser;
    const configString = sessionStorage.getItem('bitloops.config');
    const config = configString ? JSON.parse(configString) as BitloopsConfig : null;
    if (user && config) {
      const {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionState,
      } = user;
      let body = {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionState,
        workspaceId: config.workspaceId,
      };
      const headers = {};
      await axios.post(`${config?.ssl ? 'https' : 'http'}://${config?.server}/bitloops/auth/clearAuthentication`, body, {
        headers,
      });
      localStorage.removeItem('bitloops.auth.userData');
      if (auth.authChangeCallback) auth.authChangeCallback(null);
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  static getUser() {
    const bitloopsAuthUserDataString = localStorage.getItem('bitloops.auth.userData');
    return bitloopsAuthUserDataString ? JSON.parse(bitloopsAuthUserDataString) as BitloopsUser : null;
  }

  static onAuthStateChange(authChangeCallback: (user: BitloopsUser) => void) {
    const bitloopsAuthUserDataString = localStorage.getItem('bitloops.auth.userData');
    const bitloopsAuthUserData = bitloopsAuthUserDataString ? JSON.parse(bitloopsAuthUserDataString) : null;
    const authOptionsString = sessionStorage.getItem('bitloops.auth.options');
    const authOptions = authOptionsString ? JSON.parse(authOptionsString) as IAuthenticationOptions : null;
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (authOptions && authOptions.authenticationType === AuthTypes.User) {
      // Checking if user is already authenticated
      if (bitloopsAuthUserData && bitloopsAuthUserData.sessionState && bitloopsAuthUserData.accessToken) {
        const unsubscribe = auth.bitloops.subscribe(`workflow-events.auth:${bitloopsAuthUserData.providerId}:${bitloopsAuthUserData.sessionState}`, async (user: BitloopsUser) => {
          // If there is user information then we store it in our localStorage
          if (user && JSON.stringify(user) !== '{}') {
            localStorage.setItem('bitloops.auth.userData', JSON.stringify(user));
            authChangeCallback(user);
          } else {
            localStorage.removeItem('bitloops.auth.userData');
          }
          JSON.stringify(user) === '{}' ? authChangeCallback(null) : authChangeCallback(user);
          
        });
        return unsubscribe;
      // If user is not authenticated then just store the authChangeCallback to use it after authentication takes place
      } else {
        auth.authChangeCallback = authChangeCallback;
      }
    } else {
      throw new Error('Auth type must be User');
    }
    // `workflow-events.auth:${authOptions.providerId}:${sessionUuid}`
    // if (auth.bitloops.authOptions && auth.bitloops.authOptions.authenticationType === AuthTypes.User) {
    //   auth.authChangeCallback = authChangeCallback;
    //   const localStorageString = localStorage.getItem('bitloops.auth.userData');
    //   if (localStorageString) {
    //     const userData = JSON.parse(localStorageString);
    //     authChangeCallback(userData);
    //   }
    // } else {
    //   throw new Error('Auth type must be User');
    // }
  }
}

export default auth;
