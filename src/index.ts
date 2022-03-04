import axios from 'axios';
import AuthFactory from './auth/AuthFactory';
import { IAuthService } from './auth/types';
import {
  AuthTypes,
  BitloopsConfig,
  BitloopsUser,
  IBitloopsAuthenticationOptions,
  Unsubscribe,
  IInternalStorage,
} from './definitions';
import { isTokenExpired } from './helpers';
import HTTP from './HTTP';
import InternalStorageFactory from './InternalStorage/InternalStorageFactory';
import ServerSentEvents from './Subscriptions';

export { AuthTypes, BitloopsConfig, BitloopsUser, Unsubscribe };
const DEFAULT_ERR_MSG = 'Server Error';

class Bitloops {
  auth: IAuthService;

  private config: BitloopsConfig;

  private static instance: Bitloops;

  private http: HTTP;

  private subscriptions: ServerSentEvents;

  private storage: IInternalStorage;

  private constructor(config: BitloopsConfig, storage: IInternalStorage) {
    this.config = config;
    this.storage = storage;

    const http = this.initializeHttp(config);
    this.http = http;

    const subscriptions = ServerSentEvents.getInstance(http, storage, config);
    this.subscriptions = subscriptions;

    this.auth = AuthFactory.getInstance(http, storage, subscriptions, config);
  }

  public static initialize(config: BitloopsConfig): Bitloops {
    if (!Bitloops.instance) {
      const storage = InternalStorageFactory.getInstance();
      Bitloops.instance = new Bitloops(config, storage);
    }
    return Bitloops.instance;
  }

  public getConfig() {
    return this.config;
  }

  public async r(workflowId: string, nodeId: string, options?: any): Promise<any> {
    return this.request(workflowId, nodeId, options);
  }

  public async request(workflowId: string, nodeId: string, options?: any): Promise<any> {
    /* eslint-disable max-len */
    // 1. User is not logged-in and resource doesn't require authorized user    => All good nothing extra needs to happen
    // 2. User is not logged-in and resource requires authorized user           => 401 is returned from the Bitloops Engine
    // 3. User is logged-in and has valid access key                            => All good nothing extra needs to happen
    // 4. User is logged-in and has invalid access key but valid refresh key    => Refresh key is used to issue new access token and new refresh key
    // 5. User is logged-in and has invalid access key and invalid refresh key  => User's onAuthChange listener is triggered with logout
    /* eslint-enable max-len */
    const headers = await this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['workflow-id'] = workflowId;
    headers['node-id'] = nodeId;
    headers['Content-Type'] = 'application/json';
    let body = {};
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    const url = `${this.httpSecure()}://${this.config.server}/bitloops/request`;
    const { data: response, error } = await this.http.handler({
      url,
      method: 'POST',
      data: body,
      headers,
    });
    if (error) {
      return response?.data;
    }

    if (!response) return new Error(DEFAULT_ERR_MSG);
    return response.data;
  }

  public async p(messageId: string, options?: any): Promise<any> {
    return this.publish(messageId, options);
  }

  public async publish(messageId: string, options?: any): Promise<any> {
    const headers = await this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['message-id'] = messageId;
    headers['Content-Type'] = 'application/json';
    let body = {
      messageId,
      workspaceId: this.config.workspaceId,
    };
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    await this.http.handler({
      url: `${this.httpSecure()}://${this.config.server}/bitloops/publish`,
      method: 'POST',
      data: body,
      headers,
    });

    return true;
  }

  /**
   * @param namedEvent
   * @event Triggers callback when messages are pushed
   */
  public async subscribe<DataType>(
    namedEvent: string,
    callback: (data: DataType) => void,
  ): Promise<Unsubscribe> {
    return this.subscriptions.subscribe(namedEvent, callback);
  }

  private httpSecure(): 'http' | 'https' {
    return this.config.ssl === false ? 'http' : 'https';
  }

  private async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized ' };
    const { config } = this;
    const user = await this.auth.getUser();
    if (config?.auth?.authenticationType === AuthTypes.User && user?.uid) {
      const sessionUuid = await this.storage.getSessionUuid();
      headers['provider-id'] = config?.auth.providerId;
      headers['client-id'] = config?.auth.clientId;
      headers.Authorization = `User ${user.accessToken}`;
      headers['session-uuid'] = sessionUuid;
    }
    return headers;
  }

  private initializeHttp(config: BitloopsConfig): HTTP {
    if (config.auth?.authenticationType !== AuthTypes.User) {
      return new HTTP();
    }

    // Intercept response errors to Allow automatic updating of access token

    const { CancelToken } = axios;
    const beforeRequest = async (httpConfig) => {
      const bitloopsConfig = this.config;
      const user = await this.auth.getUser();
      if (bitloopsConfig?.auth?.authenticationType === AuthTypes.User && user?.uid) {
        const { accessToken, refreshToken } = user;
        const isRefreshTokenExpired = isTokenExpired(refreshToken);
        const isAccessTokenExpired = isTokenExpired(accessToken);

        console.log('isRefreshTokenExpired', isRefreshTokenExpired);
        console.log('isAccessTokenExpired', isAccessTokenExpired);

        if (isRefreshTokenExpired) {
          console.log('refresh expired, logging out');
          this.auth.clearAuthentication();
          // TODO return null => Cancel request in http interceptor
          return {
            ...httpConfig,
            cancelToken: new CancelToken((cancel) => cancel('Cancel repeated request')), // TODO fix weird Cancel request Message On some subscriptions post requests
          };
        }
        if (isAccessTokenExpired) {
          console.log('access token expired');
          const newUser = await this.refreshToken();
          if (!httpConfig.headers) httpConfig.headers = {};
          httpConfig.headers.Authorization = `User ${newUser.accessToken}`;

          // TODO return Object => Continue response
          return httpConfig;
        }
        if (!httpConfig.headers) httpConfig.headers = {};
        httpConfig.headers.Authorization = `User ${accessToken}`;
      }
      // TODO return Object => Continue response
      return httpConfig;
    };

    /**
     * Returns true if request needs to be resent
     * and false if initial error of request must be thrown
     */
    const afterResponseError = async (error: any): Promise<boolean> => {
      const originalRequest = error.config;
      if (
        config?.auth?.authenticationType === AuthTypes.User &&
        error?.response?.status === 401 &&
        !originalRequest.retry
      ) {
        await this.refreshToken();
        return true;
      }
      return false;
    };
    return new HTTP(beforeRequest.bind(this), afterResponseError.bind(this));
  }

  /**
   * Tries to refresh token, token must be signed for our clientId,
   * and not expired for success
   */
  private async refreshToken(): Promise<BitloopsUser> {
    const { config } = this;
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/refreshToken`;
    const user = await this.auth.getUser();
    if (!user?.refreshToken) throw new Error('no refresh token');
    const body = {
      refreshToken: user.refreshToken,
      clientId: (config?.auth as IBitloopsAuthenticationOptions).clientId,
      providerId: (config?.auth as IBitloopsAuthenticationOptions).providerId,
    };
    const { data: response, error } = await this.http.handlerWithoutRetries({
      url,
      method: 'POST',
      data: body,
    });
    if (error) {
      console.log('Refresh token was invalid');
      // invalid refresh token
      // clean refresh_token
      // logout user
      this.auth.clearAuthentication();
      return Promise.reject(error);
    }
    const newAccessToken = response?.data?.accessToken;
    const newRefreshToken = response?.data?.refreshToken;
    const newUser: BitloopsUser = {
      ...user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
    console.log('Updated refresh token');
    await this.storage.saveUser(newUser);
    return newUser;
  }
}

export default Bitloops;
