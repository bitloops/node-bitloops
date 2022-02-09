import { v4 as uuid } from 'uuid';
import { AuthTypes, IBitloopsAuthenticationLocalStorageOptions, LOCAL_STORAGE } from './definitions';
import Bitloops from './index';
import { BitloopsUser } from './definitions';
import axios from 'axios';

class auth {
  private static bitloops: Bitloops;
  private static authChangeCallback: ((user: BitloopsUser) => void) | null;

  static setBitloops(bitloops: Bitloops) {
    auth.bitloops = bitloops;
    if (!localStorage.getItem(LOCAL_STORAGE.SESSION_UUID)) localStorage.setItem(LOCAL_STORAGE.SESSION_UUID, uuid());
  }

  static authenticateWithGoogle() {
    const config = Bitloops.getConfig();
    const sessionUuid = localStorage.getItem('sessionUuid');
    if (config?.auth?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');
    const url = `${config?.ssl === false ? 'http' : 'https'}://${config?.server}/bitloops/auth/google?client_id=${
      config?.auth.clientId
    }&provider_id=${config?.auth.providerId}&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank');
      // Start a temporary subscription to receive information of the authentication being initiated on another tab
      // const unsubscribe = auth.bitloops.subscribe(`workflow-events.auth:${(config?.auth as IBitloopsAuthenticationLocalStorageOptions).providerId}:${sessionUuid}`, async (user: BitloopsUser) => {
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
    console.log('node bitloops logout called');
    const user = auth.getUser();
    const config = Bitloops.getConfig();
    if (user && config) {
      const { accessToken, clientId, providerId, refreshToken } = user;
      let body = {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionUuid: localStorage.getItem(LOCAL_STORAGE.SESSION_UUID),
        workspaceId: config.workspaceId,
      };
      // localStorage.removeItem('bitloops.auth.userData');
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
    const bitloopsAuthUserDataString = localStorage.getItem(LOCAL_STORAGE.USER_DATA);
    return bitloopsAuthUserDataString ? (JSON.parse(bitloopsAuthUserDataString) as BitloopsUser) : null;
  }

  static onAuthStateChange(authChangeCallback: (user: BitloopsUser | null) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid

    const user = auth.getUser();
    const config = Bitloops.getConfig();
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (config && config.auth?.authenticationType === AuthTypes.User) {
      const sessionUuid = localStorage.getItem('sessionUuid');
      /**
       * First trigger when code runs
       */
      authChangeCallback(user);

      /**
       * Subscribe for subsequent auth server events
       */
      // TODO remove async from subscribe
      const unsubscribe = auth.bitloops.subscribe(
        `workflow-events.auth:${
          (config?.auth as IBitloopsAuthenticationLocalStorageOptions).providerId
        }:${sessionUuid}`,
        (user: BitloopsUser) => {
          console.log('node-bitloops,authstate event received');
          // If there is user information then we store it in our localStorage
          if (user && JSON.stringify(user) !== '{}') {
            localStorage.setItem(LOCAL_STORAGE.USER_DATA, JSON.stringify(user));
            authChangeCallback(user);
          } else {
            localStorage.removeItem(LOCAL_STORAGE.USER_DATA);
            authChangeCallback(null);
          }
        }
      );
      return unsubscribe;
    } else {
      throw new Error('Auth type must be User');
    }
  }

  // static getAccessToken() {
  //   const bitloopsAuthUserDataString = localStorage.getItem('bitloops.auth.userData');
  //   return bitloopsAuthUserDataString ? (JSON.parse(bitloopsAuthUserDataString) as BitloopsUser).accessToken : null;
  // }

  // static setTokens(accessToken: string, refreshToken): void {
  //   const user = auth.getUser();
  //   if (user === null) throw new Error("User object doesn't exist");
  //   user.accessToken = accessToken;
  //   user.refreshToken = refreshToken;
  //   localStorage.setItem(LOCAL_STORAGE.USER_DATA, JSON.stringify(user));
  // }
}

export default auth;
