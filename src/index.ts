import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import EventSource from 'eventsource';
import auth from './auth';
import {
  AuthenticationOptionsType,
  AuthTypes,
  AxiosHandlerOutcome,
  BitloopsConfig,
  BitloopsUser,
  IBitloopsAuthenticationOptions,
  IFirebaseAuthenticationOptions,
  Unsubscribe,
  LOCAL_STORAGE,
} from './definitions';

export { AuthTypes, BitloopsConfig, BitloopsUser };

class Bitloops {
  config: BitloopsConfig;
  authType: AuthTypes;
  authOptions: AuthenticationOptionsType | undefined;
  auth = auth;
  private subscribeConnection: EventSource;
  private reconnectFreqSecs: number = 1;
  private eventMap = new Map();
  private static self: Bitloops;
  private static axiosInstance: AxiosInstance;
  private sseIsBeingInitialized: boolean = false;

  constructor(config: BitloopsConfig) {
    this.authOptions = config.auth;
    this.config = config;
    localStorage.setItem(LOCAL_STORAGE.BITLOOPS_CONFIG, JSON.stringify(config));
    this.auth.setBitloops(this);
    Bitloops.axiosInstance = this.interceptAxiosInstance();
  }

  public static getConfig() {
    const configString = localStorage.getItem(LOCAL_STORAGE.BITLOOPS_CONFIG);
    return configString ? (JSON.parse(configString) as BitloopsConfig) : null;
  }

  public static initialize(config: BitloopsConfig): Bitloops {
    return new Bitloops(config);
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
    // 1. User is not logged-in and resource doesn't require authorized user    => All good nothing extra needs to happen
    // 2. User is not logged-in and resource requires authorized user           => 401 is returned from the Bitloops Engine
    // 3. User is logged-in and has valid access key                            => All good nothing extra needs to happen
    // 4. User is logged-in and has invalid access key but valid refresh key    => Refresh key is used to issue new access token and new refresh key
    // 5. User is logged-in and has invalid access key and invalid refresh key  => User's onAuthChange listener is triggered with logout
    const headers = this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['workflow-id'] = workflowId;
    headers['node-id'] = nodeId;
    headers['Content-Type'] = 'application/json';
    let body = {};
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    let response = await axios
      .post(`${this.httpSecure()}://${this.config.server}/bitloops/request`, body, {
        headers,
      })
      .catch((error: any) => {
        return error.response;
      });
    if (
      response.status === 401 &&
      this.authOptions !== undefined &&
      this.authOptions.authenticationType === AuthTypes.FirebaseUser &&
      (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
    ) {
      const firebaseAuthOptions = this.authOptions as IFirebaseAuthenticationOptions;
      const newAccessToken = firebaseAuthOptions.refreshTokenFunction
        ? await firebaseAuthOptions.refreshTokenFunction()
        : null;
      if (newAccessToken) {
        this.authOptions['user'].accessToken = newAccessToken;
        (headers['Authorization'] = `${this.authOptions.authenticationType} ${newAccessToken}`),
          (response = await axios.post(`${this.httpSecure()}://${this.config.server}/bitloops/request`, body, {
            headers,
          }));
      }
    }
    return response.data;
  }

  public async p(messageId: string, options?: any): Promise<any> {
    return this.publish(messageId, options);
  }

  public async publish(messageId: string, options?: any): Promise<any> {
    const headers = this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['message-id'] = messageId;
    headers['Content-Type'] = 'application/json';
    let body = {
      messageId: messageId,
      workspaceId: this.config.workspaceId,
    };
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    await axios.post(`${this.httpSecure()}://${this.config.server}/bitloops/publish`, body, {
      headers,
    });
    return true;
  }

  public async subscribe<dataType>(namedEvent: string, callback: (data: dataType) => void): Promise<Unsubscribe> {
    if (this.eventMap.size === 0) localStorage.removeItem(LOCAL_STORAGE.SUBSCRIPTION_ID);
    this.eventMap.set(namedEvent, callback);
    const subscriptionConnectionId = localStorage.getItem(LOCAL_STORAGE.SUBSCRIPTION_ID) ?? '';
    if (subscriptionConnectionId === '' && this.sseIsBeingInitialized) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(this.subscribe(namedEvent, callback)), 100);
      });
    }
    if (subscriptionConnectionId === '' && this.sseIsBeingInitialized === false) {
      this.sseIsBeingInitialized = true;
    }

    /**
     * Becomes Critical section when subscriptionId = ''
     * and sse connection is being Initialized
     */
    const [response, error] = await this.registerTopicORConnection(subscriptionConnectionId, namedEvent);

    if (error || response === null) {
      this.sseIsBeingInitialized = false;
      this.eventMap.delete(namedEvent);
      console.error(error);
      return () => null;
    }

    if (this.sseIsBeingInitialized === true && subscriptionConnectionId === '') {
      localStorage.setItem(LOCAL_STORAGE.SUBSCRIPTION_ID, response.data);
      this.sseIsBeingInitialized = false;
      this.setupEventSource(true);
    }
    /**
     * End of critical section
     */

    const listenerCallback = (event: MessageEvent<any>) => {
      callback(JSON.parse(event.data));
    };
    console.log('this.subscribeConnection', this.subscribeConnection);
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

  private getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized ' };
    const config = Bitloops.getConfig();
    const user = auth.getUser();
    if (config?.auth?.authenticationType === AuthTypes.User && user?.uid) {
      const bitloopsUserAuthOptions = config?.auth as IBitloopsAuthenticationOptions;
      headers['provider-id'] = bitloopsUserAuthOptions.providerId;
      headers['client-id'] = bitloopsUserAuthOptions.clientId;
      headers['Authorization'] = `User ${user.accessToken}`;
      headers['session-uuid'] = localStorage.getItem('sessionUuid');
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

    const headers = this.getAuthHeaders();
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
    setTimeout(() => {
      console.log('Trying to reconnect sse with', this.reconnectFreqSecs);
      this.setupEventSource();
      this.reconnectFreqSecs = this.reconnectFreqSecs >= 60 ? 60 : this.reconnectFreqSecs * 2;
    }, this.reconnectFreqSecs * 1000);
  }

  private async resubscribe() {
    console.log('resubscribing topics');
    this.eventMap.forEach((callback, namedEvent) => {
      this.subscribe(namedEvent, callback);
    });
  }

  private setupEventSource(initialRun = false) {
    const subscriptionConnectionId = localStorage.getItem('bitloops.subscriptionConnectionId');
    const url = `${this.httpSecure()}://${this.config.server}/bitloops/events/${subscriptionConnectionId}`;

    const headers = this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    if (!initialRun) this.resubscribe();

    this.subscribeConnection.onopen = (e: any) => {
      // console.log('Resetting retry timer...')
      this.reconnectFreqSecs = 1;
    };

    this.subscribeConnection.onerror = (error: any) => {
      console.log('subscribeConnection.onerror, closing and re-trying');
      this.subscribeConnection.close();
      if (
        error.status === 401 &&
        this.authOptions &&
        this.authOptions.authenticationType === AuthTypes.FirebaseUser &&
        (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
      ) {
        new Promise(async (resolve, reject) => {
          if (
            error.status === 401 &&
            this.authOptions &&
            this.authOptions?.authenticationType === AuthTypes.FirebaseUser &&
            (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
          ) {
            /** On Auth error we can retry with same connId */
            const firebaseAuthOptions = this.authOptions as IFirebaseAuthenticationOptions;
            const newAccessToken = firebaseAuthOptions.refreshTokenFunction
              ? await firebaseAuthOptions.refreshTokenFunction()
              : null;
            if (newAccessToken) {
              this.authOptions['user'].accessToken = newAccessToken;
              (headers['Authorization'] = `${this.authOptions.authenticationType} ${newAccessToken}`),
                (this.subscribeConnection = new EventSource(url, eventSourceInitDict));
              // TODO on.error need to be re-bound in this edge case
              resolve(true);
            } else reject(error);
          }
        });
      } else {
        this.sseReconnect();
      }
    };
  }

  private async axiosHandler(config: AxiosRequestConfig, axiosInst: AxiosInstance): Promise<AxiosHandlerOutcome> {
    try {
      const res = await axiosInst(config);
      return [res, null];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return [error.response ?? null, error];
      }
      return [null, error];
    }
  }

  /** [1] https://thedutchlab.com/blog/using-axios-interceptors-for-refreshing-your-api-token
   *  [2] https://www.npmjs.com/package/axios#interceptors
   */
  private interceptAxiosInstance(): AxiosInstance {
    const instance = axios.create();
    // Request interceptor for API calls
    instance.interceptors.request.use(
      (config) => {
        // Do something before request is sent
        const bitloopsConfig = Bitloops.getConfig();
        const user = auth.getUser();
        if (bitloopsConfig?.auth?.authenticationType === AuthTypes.User && user?.uid) {
          const token = user?.accessToken;
          if (!config.headers) config.headers = {};
          config.headers['Authorization'] = `User ${token}`;
        }
        return config;
      },
      (error) => {
        // Do something with request error
        Promise.reject(error);
      }
    );

    // Allow automatic updating of access token
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const bitloopsConfig = Bitloops.getConfig();
        if (
          bitloopsConfig?.auth?.authenticationType === AuthTypes.User &&
          error.response.status === 401 &&
          !originalRequest._retry
        ) {
          originalRequest._retry = true;
          const config = Bitloops.getConfig();
          const url = `${config?.ssl === false ? 'http' : 'https'}://${config?.server}/bitloops/auth/refreshToken`;
          const user = auth.getUser();
          // todo skip step instead of throw
          if (!user?.refreshToken) throw new Error('no refresh token');
          const body = {
            refreshToken: user.refreshToken,
            clientId: (config?.auth as IBitloopsAuthenticationOptions).clientId,
            providerId: (config?.auth as IBitloopsAuthenticationOptions).providerId,
          };
          // const response = await axios.post(url, body);
          const [response, error] = await this.axiosHandler({ url, data: body }, axios);
          if (error || response === null) {
            console.log('Refresh token was invalid');
            // invalid refresh token
            // clean refresh_token
            // logout user
            auth.clearAuthentication();
            return Promise.reject(error);
          }
          const newAccessToken = response?.data?.accessToken;
          const newRefreshToken = response?.data?.refreshToken;
          const newUser: BitloopsUser = { ...user, accessToken: newAccessToken, refreshToken: newRefreshToken };
          console.log('Updated refresh token');
          localStorage.setItem(LOCAL_STORAGE.USER_DATA, JSON.stringify(newUser));

          return instance.request(originalRequest);
        }
      }
    );
    return instance;
  }
}

export default Bitloops;
