import { v4 as uuid } from 'uuid';
import { AuthTypes, LOCAL_STORAGE, IInternalStorage } from './definitions';
import Bitloops from './index';
import { BitloopsUser } from './definitions';
import axios from 'axios';
import { isBrowser as envIsBrowser } from './helpers';
import { InternalStorageFactory } from './InternalStorage/InternalStorageFactory';

class Auth {
  private static bitloops: Bitloops;
  private static storage: IInternalStorage;

  static setBitloops(bitloops: Bitloops) {
    Auth.bitloops = bitloops;
    Auth.storage = InternalStorageFactory.getInstance();
    if (!Auth.storage.getSessionUuid()) Auth.storage.saveSessionUuid(uuid());
  }

  static authenticateWithGoogle() {
    const config = Auth.bitloops.getConfig();
    const sessionUuid = Auth.storage.getSessionUuid();
    if (config?.auth?.authenticationType !== AuthTypes.User) throw new Error('Auth type must be User');
    const url = `${config?.ssl === false ? 'http' : 'https'}://${config?.server}/bitloops/auth/google?client_id=${
      config?.auth.clientId
    }&provider_id=${config?.auth.providerId}&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;
    if (envIsBrowser()) {
      window.open(url, '_blank');
    }
  }

  static async clearAuthentication() {
    // TODO communicate logout to REST
    console.log('node bitloops logout called');
    const user = Auth.getUser();
    const config = Auth.bitloops.getConfig();
    if (user && config) {
      const { accessToken, clientId, providerId, refreshToken } = user;
      let body = {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionUuid: Auth.storage.getSessionUuid(),
        workspaceId: config.workspaceId,
      };
      const headers = {};
      await axios.post(
        `${config?.ssl ? 'https' : 'http'}://${config?.server}/bitloops/auth/clearAuthentication`,
        body,
        {
          headers,
        },
      );
      Auth.storage.deleteUser();
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  static getUser(): BitloopsUser | null {
    return Auth.storage.getUser();
  }

  static onAuthStateChange(authChangeCallback: (user: BitloopsUser | null) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid

    const user = Auth.getUser();
    const config = Auth.bitloops.getConfig();
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (config && config.auth?.authenticationType === AuthTypes.User) {
      const sessionUuid = Auth.storage.getSessionUuid();
      /**
       * First trigger when code runs
       */
      authChangeCallback(user);

      /**
       * Subscribe for subsequent auth server events
       */
      // TODO remove async from subscribe
      const unsubscribe = Auth.bitloops.subscribe(
        `workflow-events.auth:${config?.auth.providerId}:${sessionUuid}`,
        (user: BitloopsUser) => {
          console.log('node-bitloops,authstate event received');
          // If there is user information then we store it in our localStorage
          if (user && JSON.stringify(user) !== '{}') {
            Auth.storage.saveUser(user);
            authChangeCallback(user);
          } else {
            Auth.storage.deleteUser();
            authChangeCallback(null);
          }
        },
      );
      return unsubscribe;
    } else {
      throw new Error('Auth type must be User');
    }
  }
}

export default Auth;
