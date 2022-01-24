import { v4 as uuid } from 'uuid';
import {
  AuthTypes,
  AuthenticationOptionsType,
  BitloopsConfig,
  IBitloopsAuthenticationOptions,
  IAuthenticationOptions,
} from './definitions';
import Bitloops from './index';
import { BitloopsUser } from './definitions';
import axios from 'axios';

class auth {
  private static bitloops: Bitloops;
  private static authChangeCallback: ((user: BitloopsUser) => void) | null;

  static setBitloops(bitloops: Bitloops) {
    auth.bitloops = bitloops;
    if (!localStorage.getItem('sessionUuid')) localStorage.setItem('sessionUuid', uuid());
  }

  static authenticateWithGoogle() {
    const config = Bitloops.getConfig();
    const sessionUuid = localStorage.getItem('sessionUuid');
    if (config?.auth?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');
    const url = `${config?.ssl === false ? 'http' : 'https'}://${config?.server}/bitloops/auth/google?client_id=${
      (config?.auth as IBitloopsAuthenticationOptions).clientId
    }&provider_id=${(config?.auth as IBitloopsAuthenticationOptions).providerId}&workspace_id=${
      config.workspaceId
    }&session_uuid=${sessionUuid}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      // Start a temporary subscription to receive information of the authentication being initiated on another tab
      // const unsubscribe = auth.bitloops.subscribe(`workflow-events.auth:${(config?.auth as IBitloopsAuthenticationOptions).providerId}:${sessionUuid}`, async (user: BitloopsUser) => {
      //   // Store the callback function to use it in onAuthStateChange after the authentication process completes
      //   if (auth.authChangeCallback) auth.authChangeCallback(user);
      //   if (user) {
      //     // If there is user information then we store it in our localStorage
      //     localStorage.setItem('bitloops.auth.userData', JSON.stringify(user));
      //     // Unsubscribe from the temp subscription
      //     (await unsubscribe)();
      //     // If authChangeCallback was set before the user was authenticated and had a sessionState
      //     // we have to set the callback and sessionState subscription now that we do have a sessionState
      //     if (auth.authChangeCallback) {
      //       auth.onAuthStateChange(auth.authChangeCallback);
      //     }
      //   // Probably this is not needed any longer as we should only need it during logout
      //   // that will be heard by the long term onAuthStateChange subscription and not here
      //   // TODO after testing see if this is any longer required and see if we need to do error handling here
      //   // as user should be always set when this runs
      //   } else {
      //     localStorage.removeItem('bitloops.auth.userData');
      //   }
      // })
    }
  }

  static async clearAuthentication() {
    // TODO communicate logout to REST
    const user = auth.getUser() as BitloopsUser;
    const configString = localStorage.getItem('bitloops.config');
    const config = configString ? (JSON.parse(configString) as BitloopsConfig) : null;
    if (user && config) {
      const { accessToken, clientId, providerId, refreshToken } = user;
      let body = {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionUuid: localStorage.getItem('sessionUuid'),
        workspaceId: config.workspaceId,
      };
      const headers = {};
      await axios.post(
        `${config?.ssl ? 'https' : 'http'}://${config?.server}/bitloops/auth/clearAuthentication`,
        body,
        {
          headers,
        }
      );
      localStorage.removeItem('bitloops.auth.userData');
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  static getUser(): BitloopsUser | null {
    const bitloopsAuthUserDataString = localStorage.getItem('bitloops.auth.userData');
    return bitloopsAuthUserDataString ? (JSON.parse(bitloopsAuthUserDataString) as BitloopsUser) : null;
  }

  static onAuthStateChange(authChangeCallback: (user: BitloopsUser) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid
    const user = auth.getUser();
    const config = Bitloops.getConfig();
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (config && config.auth?.authenticationType === AuthTypes.User) {
      const sessionUuid = localStorage.getItem('sessionUuid');
      // Checking if user is already authenticated
      // if (user && user.sessionState && user.accessToken) {
      const unsubscribe = auth.bitloops.subscribe(
        `workflow-events.auth:${(config?.auth as IBitloopsAuthenticationOptions).providerId}:${sessionUuid}`,
        async (user: BitloopsUser) => {
          // If there is user information then we store it in our localStorage
          if (user && JSON.stringify(user) !== '{}') {
            localStorage.setItem('bitloops.auth.userData', JSON.stringify(user));
            authChangeCallback(user);
          } else {
            localStorage.removeItem('bitloops.auth.userData');
            authChangeCallback(null);
          }
        }
      );
      return unsubscribe;
    } else {
      throw new Error('Auth type must be User');
    }
  }
}

export default auth;
