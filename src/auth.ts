import { v4 as uuid } from 'uuid';
import axios from 'axios';
import { AuthTypes, IInternalStorage, BitloopsUser } from './definitions';
// eslint-disable-next-line import/no-cycle
import Bitloops from './index';
import { isBrowser as envIsBrowser } from './helpers';
import InternalStorageFactory from './InternalStorage/InternalStorageFactory';

class Auth {
  private static bitloops: Bitloops;

  private static storage: IInternalStorage;

  static async setBitloops(bitloops: Bitloops) {
    Auth.bitloops = bitloops;
    Auth.storage = InternalStorageFactory.getInstance();
    const currentSession = await Auth.storage.getSessionUuid();
    if (!currentSession) await Auth.storage.saveSessionUuid(uuid());
  }

  static async authenticateWithGoogle() {
    const config = Auth.bitloops.getConfig();
    const sessionUuid = await Auth.storage.getSessionUuid();
    if (config?.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('Auth type must be User');
    }
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/google?client_id=${config?.auth.clientId}&provider_id=${
      config?.auth.providerId
    }&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;
    if (envIsBrowser()) {
      window.open(url, '_blank');
    }
  }

  static async clearAuthentication() {
    // TODO communicate logout to REST
    console.log('node bitloops logout called');
    const user = await Auth.getUser();
    const config = Auth.bitloops.getConfig();
    if (user && config) {
      const { accessToken, clientId, providerId, refreshToken } = user;
      const sessionUuid = await Auth.storage.getSessionUuid();
      const body = {
        accessToken,
        clientId,
        providerId,
        refreshToken,
        sessionUuid,
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
      await Auth.storage.deleteUser();
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  static async getUser(): Promise<BitloopsUser | null> {
    return Auth.storage.getUser();
  }

  static async onAuthStateChange(authChangeCallback: (user: BitloopsUser | null) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid

    const user = await Auth.getUser();
    const config = Auth.bitloops.getConfig();
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (config && config.auth?.authenticationType === AuthTypes.User) {
      const sessionUuid = await Auth.storage.getSessionUuid();
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
        async (receivedUser: BitloopsUser) => {
          console.log('node-bitloops,authstate event received');
          // If there is user information then we store it in our localStorage
          if (receivedUser && JSON.stringify(receivedUser) !== '{}') {
            await Auth.storage.saveUser(receivedUser);
            authChangeCallback(receivedUser);
          } else {
            await Auth.storage.deleteUser();
            authChangeCallback(null);
          }
        },
      );
      return unsubscribe;
    }
    throw new Error('Auth type must be User');
  }
}

export default Auth;
