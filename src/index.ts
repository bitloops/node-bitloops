import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import EventSource from 'eventsource-ts';
// eslint-disable-next-line import/no-cycle
import AuthFactory from './auth/AuthFactory';
import { IAuthService } from './auth/types';
import {
  AuthenticationOptionsType,
  AuthTypes,
  AxiosHandlerOutcome,
  BitloopsConfig,
  BitloopsUser,
  IBitloopsAuthenticationOptions,
  Unsubscribe,
  IInternalStorage,
  UnsubscribeParams,
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

  auth: IAuthService;

  private subscribeConnection: EventSource;

  private subscriptionId: string = '';

  private _sseIsBeingInitialized: boolean = false;

  private reconnectFreqSecs: number = 1;

  private readonly eventMap = new Map();

  private static axiosInstance: AxiosInstance;

  private storage: IInternalStorage;

  private constructor(config: BitloopsConfig, storage: IInternalStorage) {
    this.config = config;
    this.storage = storage;
    // this.auth.setBitloops(this);
    this.initializeAuth(storage);
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

  private initializeAuth(storage: IInternalStorage) {
    this.auth = AuthFactory.getInstance(this, storage);
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

  /**
   * @param namedEvent
   * @event Triggers callback when messages are pushed
   */
  public async subscribe<DataType>(
    namedEvent: string,
    callback: (data: DataType) => void,
  ): Promise<Unsubscribe> {
    console.log('subscribing topic:', namedEvent);
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
    const { data: response, error } = await this.registerTopicORConnection(
      this.subscriptionId,
      namedEvent,
    );

    if (error || response === null) {
      console.error('registerTopicORConnection error', error);
      // console.error('registerTopicORConnection', error);
      this.sseIsBeingInitialized = false;
      // TODO differentiate errors - Throw on host unreachable
      throw new Error(`registerTopicORConnection error:  ${JSON.stringify(error)}`);
    }
    console.log('registerTopicORConnection success', response.data);

    /** If you are the initiator, establish sse connection */
    if (this.sseIsBeingInitialized === true && this.subscriptionId === '') {
      this.subscriptionId = response.data;
      this.sseIsBeingInitialized = false;
      await this.setupEventSource();
    }
    /**
     * End of critical section
     */

    const listenerCallback = (event: MessageEvent<any>) => {
      console.log(`received event for namedEvent: ${namedEvent}`);
      callback(JSON.parse(event.data));
    };
    console.log('this.subscribeConnection', this.subscribeConnection);
    console.log(`add event listener for namedEvent: ${namedEvent}`);
    this.subscribeConnection.addEventListener(namedEvent, listenerCallback);

    return this.unsubscribe({ namedEvent, subscriptionId: this.subscriptionId, listenerCallback });
  }

  private httpSecure(): 'http' | 'https' {
    return this.config.ssl === false ? 'http' : 'https';
  }

  private async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized' };
    const { config } = this;
    const user = await this.auth.getUser();
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
   * Removes event listener from subscription.
   * Deletes events from mapping that had been subscribed.
   * Handles remaining dead subscription connections, in order to not send events.
   * @param subscriptionId
   * @param namedEvent
   * @param listenerCallback
   * @returns void
   */
  private unsubscribe({ subscriptionId, namedEvent, listenerCallback }: UnsubscribeParams) {
    return async (): Promise<void> => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCallback);
      console.log(`removed eventListener for ${namedEvent}`);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();

      const unsubscribeUrl = `${this.httpSecure()}://${
        this.config.server
      }/bitloops/events/unsubscribe/${subscriptionId}`;

      const headers = await this.getAuthHeaders();

      await this.axiosHandler(
        {
          url: unsubscribeUrl,
          method: 'POST',
          headers,
          data: { workspaceId: this.config.workspaceId, topic: namedEvent },
        },
        Bitloops.axiosInstance,
      );
    };
  }

  /**
   * Gets a new connection Id if called from the first subscriber
   * In all cases it registers the topic to the Connection Id
   * @param subscriptionId
   * @param namedEvent
   * @returns
   */
  private async registerTopicORConnection(subscriptionId: string, namedEvent: string) {
    const subscribeUrl = `${this.httpSecure()}://${
      this.config.server
    }/bitloops/events/subscribe/${subscriptionId}`;

    const headers = await this.getAuthHeaders();
    console.log('Sending headers', headers);
    try {
      const res = await Bitloops.axiosInstance({
        url: subscribeUrl,
        method: 'POST',
        headers,
        data: { topics: [namedEvent], workspaceId: this.config.workspaceId },
      });
      return { data: res, error: null };
    } catch (error) {
      console.log('axios Error');
      if (axios.isAxiosError(error)) {
        return { data: null, error: error.response };
      }
      return { data: null, error };
    }
  }

  /**
   * Ask for new connection
   */
  private sseReconnect() {
    setTimeout(async () => {
      console.log('Trying to reconnect sse with', this.reconnectFreqSecs);
      // await this.setupEventSource();
      this.reconnectFreqSecs = this.reconnectFreqSecs >= 60 ? 60 : this.reconnectFreqSecs * 2;
      return this.tryToResubscribe();
    }, this.reconnectFreqSecs * 1000);
  }

  private async tryToResubscribe() {
    console.log('Attempting to resubscribe');
    console.log(' this.eventMap.length', this.eventMap.size);
    const subscribePromises = Array.from(this.eventMap.entries()).map(([namedEvent, callback]) =>
      this.subscribe(namedEvent, callback),
    );
    try {
      console.log('this.eventMap length', subscribePromises.length);
      await Promise.all(subscribePromises);
      console.log('Resubscribed all topic successfully!');
      // All subscribes were successful => done
    } catch (error) {
      // >= 1 subscribes failed => retry
      console.log(`Failed to resubscribe, retrying... in ${this.reconnectFreqSecs}`);
      this.subscribeConnection.close();
      this.sseReconnect();
    }
  }

  private async setupEventSource() {
    const { subscriptionId } = this;
    const url = `${this.httpSecure()}://${this.config.server}/bitloops/events/${subscriptionId}`;

    const headers = await this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    // Need to subscribe with a valid subscriptionConnectionId, or rest will reject us
    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    // if (!initialRun) this.resubscribe();

    this.subscribeConnection.onopen = () => {
      this.reconnectFreqSecs = 1;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.subscribeConnection.onerror = (error: any) => {
      // on error, rest will clear our connectionId so we need to create a new one
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
        const user = await this.auth.getUser();
        if (bitloopsConfig?.auth?.authenticationType === AuthTypes.User && user?.uid) {
          const { accessToken, refreshToken } = user;
          // TODO check if expired access,refresh
          const isRefreshTokenExpired = isTokenExpired(refreshToken);
          const isAccessTokenExpired = isTokenExpired(accessToken);

          console.log('isRefreshTokenExpired', isRefreshTokenExpired);
          console.log('isAccessTokenExpired', isAccessTokenExpired);

          if (isRefreshTokenExpired) {
            console.log('refresh expired, logging out');
            this.auth.clearAuthentication();
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
          error?.response?.status === 401 &&
          !originalRequest.retry
        ) {
          originalRequest.retry = true;
          console.log('Got 401 response, refreshing token...');
          await this.refreshToken();
          return instance.request(originalRequest);
        }
        return Promise.reject(error);
      },
    );

    return instance;
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
    const { data: response, error } = await this.axiosHandler(
      { url, method: 'POST', data: body },
      axios,
    );
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
