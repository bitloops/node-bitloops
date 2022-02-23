import { v4 as uuid } from 'uuid';
import axios from 'axios';
import { AuthTypes, IInternalStorage, BitloopsUser } from '../definitions';
// eslint-disable-next-line import/no-cycle
import Bitloops from '../index';
import { IAuthService } from './types';

class AuthClient implements IAuthService {
  private bitloops: Bitloops;

  private storage: IInternalStorage;

  constructor(bitloops: Bitloops, storage: IInternalStorage) {
    this.bitloops = bitloops;
    this.storage = storage;
    this.initializeSession();
  }

  private async initializeSession() {
    const currentSession = await this.storage.getSessionUuid();
    if (!currentSession) await this.storage.saveSessionUuid(uuid());
  }

  async authenticateWithGoogle() {
    const config = this.bitloops.getConfig();
    const sessionUuid = await this.storage.getSessionUuid();
    if (config?.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('Auth type must be User');
    }
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/google?client_id=${config?.auth.clientId}&provider_id=${
      config?.auth.providerId
    }&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;

    window.open(url, '_blank');
  }

  async clearAuthentication() {
    // TODO communicate logout to REST
    console.log('node bitloops logout called');
    const user = await this.getUser();
    const config = this.bitloops.getConfig();
    if (user && config) {
      const { accessToken, clientId, providerId, refreshToken } = user;
      const sessionUuid = await this.storage.getSessionUuid();
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
      await this.storage.deleteUser();
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  async getUser(): Promise<BitloopsUser | null> {
    return this.storage.getUser();
  }

  async onAuthStateChange(authChangeCallback: (user: BitloopsUser | null) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid

    const user = await this.getUser();
    const config = this.bitloops.getConfig();
    // Checking if the correct auth type is being used else you cannot use onAuthStateChange
    if (config && config.auth?.authenticationType === AuthTypes.User) {
      const sessionUuid = await this.storage.getSessionUuid();
      /**
       * First trigger when code runs
       */
      authChangeCallback(user);

      /**
       * Subscribe for subsequent auth server events
       */
      // TODO remove async from subscribe
      const unsubscribe = this.bitloops.subscribe(
        `workflow-events.auth:${config?.auth.providerId}:${sessionUuid}`,
        async (receivedUser: BitloopsUser) => {
          console.log('node-bitloops,authstate event received');
          // If there is user information then we store it in our localStorage
          if (receivedUser && JSON.stringify(receivedUser) !== '{}') {
            await this.storage.saveUser(receivedUser);
            authChangeCallback(receivedUser);
          } else {
            await this.storage.deleteUser();
            authChangeCallback(null);
          }
        },
      );
      return unsubscribe;
    }
    throw new Error('Auth type must be User');
  }
}

export default AuthClient;
