import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import EventSource from 'eventsource';
// eslint-disable-next-line import/no-cycle
import Auth from './auth';
import {
  AuthenticationOptionsType,
  AuthTypes,
  AxiosHandlerOutcome,
  BitloopsConfig,
  BitloopsUser,
  IBitloopsAuthenticationOptions,
  Unsubscribe,
  IInternalStorage,
} from './definitions';
import { isTokenExpired } from './helpers';
import InternalStorageFactory from './InternalStorage/InternalStorageFactory';

export { AuthTypes, BitloopsConfig, BitloopsUser };
const DEFAULT_ERR_MSG = 'Server Error';

class Bitloops {
  private static instance: Bitloops;

  config: BitloopsConfig;

  authType: AuthTypes;

  authOptions: AuthenticationOptionsType | undefined;

  auth = Auth;

  private subscribeConnection: EventSource;

  private subscriptionId: string = '';

  private _sseIsBeingInitialized: boolean = false;

  private reconnectFreqSecs: number = 1;

  private readonly eventMap = new Map();

  private static axiosInstance: AxiosInstance;

  private storage: IInternalStorage;

  private constructor(config: BitloopsConfig, storage: IInternalStorage) {
    this.authOptions = config.auth;
    this.config = config;
    this.storage = storage;
    this.auth.setBitloops(this);
    Bitloops.axiosInstance = this.interceptAxiosInstance();
  }

  private get sseIsBeingInitialized() {
    return this._sseIsBeingInitialized;
  }

  private set sseIsBeingInitialized(flagValue: boolean) {
    this._sseIsBeingInitialized = flagValue;
  }

  public getConfig() {
    return this.config;
  }

  public static initialize(config: BitloopsConfig): Bitloops {
    if (!Bitloops.instance) {
      const storage = InternalStorageFactory.getInstance();
      Bitloops.instance = new Bitloops(config, storage);
    }
    return Bitloops.instance;
  }

  public authenticate(options: AuthenticationOptionsType): void {
    this.authOptions = options;
  }

  public signOut(): void {
    this.authOptions = undefined;
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
    const { data: response, error } = await this.axiosHandler(
      { url, method: 'POST', data: body, headers },
      Bitloops.axiosInstance,
    );
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

    await Bitloops.axiosInstance.post(
      `${this.httpSecure()}://${this.config.server}/bitloops/publish`,
      body,
      {
        headers,
      },
    );
    return true;
  }

  public async subscribe<DataType>(
    namedEvent: string,
    callback: (data: DataType) => void,
  ): Promise<Unsubscribe> {
    // if (this.eventMap.size === 0) this.subscriptionId = '';
    this.eventMap.set(namedEvent, callback);
    /** Retry if connection is being initialized */
    if (this.subscriptionId === '' && this.sseIsBeingInitialized) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(this.subscribe(namedEvent, callback)), 100);
      });
    }
    /** Set initializing flag if you are the initiator */
    if (this.subscriptionId === '' && this.sseIsBeingInitialized === false) {
      this.sseIsBeingInitialized = true;
    }

    /**
     * Becomes Critical section when subscriptionId = ''
     * and sse connection is being Initialized
     * If you are the initiator, response contains new subscriptionId from server
     */
    const [response, error] = await this.registerTopicORConnection(this.subscriptionId, namedEvent);

    if (error || response === null) {
      console.error(error);
      this.sseIsBeingInitialized = false;
      this.eventMap.delete(namedEvent);
      return () => null;
    }

    /** If you are the initiator, establish sse connection */
    if (this.sseIsBeingInitialized === true && this.subscriptionId === '') {
      this.subscriptionId = response.data;
      this.sseIsBeingInitialized = false;
      await this.setupEventSource(true);
    }
    /**
     * End of critical section
     */

    const listenerCallback = (event: MessageEvent<any>) => {
      callback(JSON.parse(event.data));
    };
    // console.log('this.subscribeConnection', this.subscribeConnection);
    this.subscribeConnection.addEventListener(namedEvent, listenerCallback);

    return () => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCallback);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();
    };
  }

  private httpSecure(): 'http' | 'https' {
    return this.config.ssl === false ? 'http' : 'https';
  }

  private async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized ' };
    const { config } = this;
    const user = await Auth.getUser();
    if (config?.auth?.authenticationType === AuthTypes.User && user?.uid) {
      const bitloopsUserAuthOptions = config?.auth as IBitloopsAuthenticationOptions;
      const sessionUuid = await this.storage.getSessionUuid();
      headers['provider-id'] = bitloopsUserAuthOptions.providerId;
      headers['client-id'] = bitloopsUserAuthOptions.clientId;
      headers.Authorization = `User ${user.accessToken}`;
      headers['session-uuid'] = sessionUuid;
    }
    return headers;
  }

  /**
   * Gets a new connection Id if called from the first subscriber
   * In all cases it registers the topic to the Connection Id
   * @param subscriptionConnectionId
   * @param namedEvent
   * @returns
   */
  private async registerTopicORConnection(subscriptionConnectionId: string, namedEvent: string) {
    const subscribeUrl = `${this.httpSecure()}://${
      this.config.server
    }/bitloops/events/subscribe/${subscriptionConnectionId}`;

    const headers = await this.getAuthHeaders();
    try {
      const res = await Bitloops.axiosInstance({
        url: subscribeUrl,
        method: 'POST',
        headers,
        data: { topics: [namedEvent], workspaceId: this.config.workspaceId },
      });
      return [res, null];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return [error.response ?? null, error];
      }
      return [null, error];
    }
  }

  private sseReconnect() {
    setTimeout(async () => {
      console.log('Trying to reconnect sse with', this.reconnectFreqSecs);
      await this.setupEventSource();
      this.reconnectFreqSecs = this.reconnectFreqSecs >= 60 ? 60 : this.reconnectFreqSecs * 2;
    }, this.reconnectFreqSecs * 1000);
  }

  private async resubscribe() {
    console.log('resubscribing topics');
    this.eventMap.forEach((callback, namedEvent) => {
      this.subscribe(namedEvent, callback);
    });
  }

  private async setupEventSource(initialRun = false) {
    const subscriptionConnectionId = this.subscriptionId;
    const url = `${this.httpSecure()}://${
      this.config.server
    }/bitloops/events/${subscriptionConnectionId}`;

    const headers = await this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    if (!initialRun) this.resubscribe();

    this.subscribeConnection.onopen = () => {
      // console.log('Resetting retry timer...')
      this.reconnectFreqSecs = 1;
    };

    this.subscribeConnection.onerror = (error: any) => {
      console.log('subscribeConnection.onerror, closing and re-trying', error);
      this.subscribeConnection.close();
      this.subscriptionId = '';
      this.sseReconnect();
    };
  }

  private async axiosHandler(
    config: AxiosRequestConfig,
    axiosInst: AxiosInstance,
  ): Promise<AxiosHandlerOutcome> {
    try {
      const res = await axiosInst(config);
      return { data: res, error: null };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { data: error.response, error };
      }
      return { data: null, error };
    }
  }

  /** [1] https://thedutchlab.com/blog/using-axios-interceptors-for-refreshing-your-api-token
   *  [2] https://www.npmjs.com/package/axios#interceptors
   */
  private interceptAxiosInstance(): AxiosInstance {
    const instance = axios.create();
    const { CancelToken } = axios;
    // Request interceptor for API calls
    instance.interceptors.request.use(
      async (config) => {
        // Do something before request is sent
        const bitloopsConfig = this.config;
        const user = await Auth.getUser();
        if (bitloopsConfig?.auth?.authenticationType === AuthTypes.User && user?.uid) {
          const { accessToken, refreshToken } = user;
          // TODO check if expired access,refresh
          const isRefreshTokenExpired = isTokenExpired(refreshToken);
          const isAccessTokenExpired = isTokenExpired(accessToken);

          // console.log('isRefreshTokenExpired', isRefreshTokenExpired);
          // console.log('isAccessTokenExpired', isAccessTokenExpired);

          if (isRefreshTokenExpired) {
            console.log('refresh expired, logging out');
            Auth.clearAuthentication();
            return {
              ...config,
              cancelToken: new CancelToken((cancel) => cancel('Cancel repeated request')),
            };
          }
          if (isAccessTokenExpired) {
            console.log('access token expired');
            const newUser = await this.refreshToken();
            if (!config.headers) config.headers = {};
            config.headers.Authorization = `User ${newUser.accessToken}`;
            return config;
          }
          if (!config.headers) config.headers = {};
          config.headers.Authorization = `User ${accessToken}`;
        }
        return config;
      },
      (error) => {
        // Do something with request error
        Promise.reject(error);
      },
    );

    // Allow automatic updating of access token
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const bitloopsConfig = this.config;
        if (
          bitloopsConfig?.auth?.authenticationType === AuthTypes.User &&
          error.response.status === 401 &&
          !originalRequest.retry
        ) {
          originalRequest.retry = true;
          console.log('before refreshh');
          await this.refreshToken();
          return instance.request(originalRequest);
        }
        return Promise.reject(error);
      },
    );

    return instance;
  }

  private async refreshToken(): Promise<BitloopsUser> {
    const { config } = this;
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/refreshToken`;
    const user = await Auth.getUser();
    if (!user?.refreshToken) throw new Error('no refresh token');
    const body = {
      refreshToken: user.refreshToken,
      clientId: (config?.auth as IBitloopsAuthenticationOptions).clientId,
      providerId: (config?.auth as IBitloopsAuthenticationOptions).providerId,
    };
    const { data: response, error } = await this.axiosHandler(
      { url, method: 'POST', data: body },
      axios,
    );
    if (error) {
      console.log('Refresh token was invalid');
      // invalid refresh token
      // clean refresh_token
      // logout user
      Auth.clearAuthentication();
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
