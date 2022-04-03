import { v4 as uuid } from 'uuid';
import { AuthTypes, IInternalStorage, BitloopsUser, BitloopsConfig } from '../definitions';
import { IAuthService } from './types';
import { isTokenExpired, parseJwt } from '../helpers';
import ServerSentEvents from '../Subscriptions';
import HTTP from '../HTTP';
import AuthBase from './AuthBase';

class AuthClient extends AuthBase implements IAuthService {
  private subscriptions: ServerSentEvents;

  private authChangeCallback: (user: BitloopsUser | null) => void;

  constructor(
    subscriptions: ServerSentEvents,
    storage: IInternalStorage,
    http: HTTP,
    bitloopsConfig: BitloopsConfig,
  ) {
    super(storage, http, bitloopsConfig);

    this.subscriptions = subscriptions;
    this.initializeSession();
  }

  private async initializeSession() {
    const currentSession = await this.storage.getSessionUuid();
    if (!currentSession) await this.storage.saveSessionUuid(uuid());
  }

  async authenticateWithGoogle() {
    this.authenticateWithProvider('google');
  }

  async authenticateWithGitHub(): Promise<void> {
    this.authenticateWithProvider('github');
  }

  private async authenticateWithProvider(provider: string) {
    const config = this.bitloopsConfig;
    const sessionUuid = await this.storage.getSessionUuid();
    if (config?.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('Auth type must be User');
    }
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/${provider}?client_id=${config?.auth.clientId}&provider_id=${
      config?.auth.providerId
    }&workspace_id=${config.workspaceId}&session_uuid=${sessionUuid}`;

    window.open(url, '_blank');
  }

  async sendVerificationCode(phone: string): Promise<void> {
    // It's not a simple bitloops.request, we want a specific environment (production)
    // not a user defined environment created for his services
    const config = this.bitloopsConfig;

    if (config.auth?.authenticationType !== AuthTypes.User)
      throw new Error('AuthType must be user in order to use phone auth');

    const { workspaceId, ssl, server, auth, environmentId } = config;
    const headers = {
      Authorization: 'Unauthorized',
      'workspace-id': workspaceId,
      'environment-id': environmentId, // TODO not config.environmentId (OURS-system workflow);
      'workflow-id': '3408dc57-fd96-4e0e-b368-667a4f0715a3',
      'node-id': '01fef4df-ecf4-4836-b2e2-3f62b209ecf7',
      'Content-Type': 'application/json',
    };
    const body = {
      providerId: auth.providerId,
      phoneNumber: phone,
    };

    const protocol = ssl === false ? 'http' : 'https';
    const url = `${protocol}://${server}/bitloops/request`;
    const { data: response, error } = await this.http.handlerWithoutRetries({
      url,
      method: 'POST',
      data: body,
      headers,
    });
    if (error) {
      console.error(response?.data);
      return;
    }

    if (!response) console.error('unexpected error', error, response);

    console.log('sendVerificationCode response', response);
  }

  async verifyPhoneCode(phone: string, code: string): Promise<void> {
    const config = this.bitloopsConfig;

    if (config.auth?.authenticationType !== AuthTypes.User)
      throw new Error('AuthType must be user in order to use phone auth');

    const { workspaceId, ssl, server, auth, environmentId } = config;
    const headers = {
      Authorization: 'Unauthorized',
      'workspace-id': workspaceId,
      'environment-id': environmentId, // TODO not config.environmentId (OURS-system workflow);
      'workflow-id': '3408dc57-fd96-4e0e-b368-667a4f0715a3',
      'node-id': 'f53dd6e8-45f4-4541-8784-ddea0e5f6af0',
      'Content-Type': 'application/json',
    };

    const body = {
      providerId: auth.providerId,
      phoneNumber: phone,
      verificationCode: code,
      clientId: auth.clientId,
    };

    const protocol = ssl === false ? 'http' : 'https';
    const url = `${protocol}://${server}/bitloops/request`;
    const { data: response, error } = await this.http.handlerWithoutRetries({
      url,
      method: 'POST',
      data: body,
      headers,
    });
    if (error) {
      throw new Error(response?.data);
    }

    if (!response) throw new Error('Error');
    console.log('verifyPhoneCode response', response);
    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      session_state: sessionState,
    } = response.data;
    const jwt = parseJwt(accessToken);
    // console.log('parsedJwt', jwt);
    const { sub: uid, preferred_username: username } = jwt;

    const user: Partial<BitloopsUser> = {
      accessToken,
      refreshToken,
      sessionState,
      uid,
      displayName: username,
      jwt: parseJwt(accessToken),
    };
    // TODO fix types of BitloopsUser for different providers
    await this.storage.saveUser(user as any);
    // TODO fix types of BitloopsUser for different providers
    this.authChangeCallback(user as BitloopsUser);
  }

  async clearAuthentication() {
    console.log('node bitloops logout called');
    const user = await this.storage.getUser();
    const config = this.bitloopsConfig;
    if (user === null || config.auth?.authenticationType !== AuthTypes.User) {
      return;
    }

    const { accessToken, clientId, providerId, refreshToken } = user;
    const isRefreshTokenExpired = isTokenExpired(refreshToken);
    const isAccessTokenExpired = isTokenExpired(accessToken);

    /**
     * Inform rest for logout only if tokens are valid
     */
    if (!isRefreshTokenExpired && !isAccessTokenExpired) {
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
      const { data, error } = await this.http.handlerWithoutRetries({
        url: `${config?.ssl ? 'https' : 'http'}://${
          config?.server
        }/bitloops/auth/clearAuthentication`,
        method: 'POST',
        data: body,
        headers,
      });

      if (error) {
        console.log('clearAuthentication failed:', (error as any)?.response?.status);
      }
    }
    // It fails when refresh is invalid and error is received from rest
    // TODO manually call AuthStateChanged with null values?
    // else trigger it from rest even if refresh is invalid
    await this.storage.deleteUser();

    if (this.authChangeCallback) this.authChangeCallback(null);
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  // Returns the user information stored in localStorage
  async getUser(): Promise<BitloopsUser | null> {
    return this.storage.getUser();
  }

  async onAuthStateChange(authChangeCallback: (user: BitloopsUser | null) => void) {
    // 1. User is unauthorized and subscribes to onAuthStateChange => we use the sessionUuid
    // 2. User is authorized and subscribed to onAuthStateChange => we use the sessionUuid
    this.authChangeCallback = authChangeCallback;

    const user = await this.storage.getUser();
    const config = this.bitloopsConfig;
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
      const unsubscribe = this.subscriptions.subscribe(
        `workflow-events.auth:${config?.auth.providerId}:${sessionUuid}`,
        async (receivedUser: BitloopsUser) => {
          console.log('node-bitloops,authstate event received');
          // If there is user information then we store it in our localStorage
          if (receivedUser && JSON.stringify(receivedUser) !== '{}') {
            console.log('SAVING RECEIVED USER', receivedUser);
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
