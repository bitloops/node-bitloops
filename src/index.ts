import axios from 'axios';
import EventSource from 'eventsource';
import auth from './auth';
import { AuthenticationOptionsType, AuthTypes, BitloopsConfig, BitloopsUser, IAuthenticationOptions, IBitloopsAuthenticationOptions, IFirebaseAuthenticationOptions, Unsubscribe } from './definitions';

export { AuthTypes };

class Bitloops {
  config: BitloopsConfig;
  authType: AuthTypes;
  authOptions: AuthenticationOptionsType | undefined;
  auth = auth;
  private subscribeConnection: EventSource;
  private reconnectFreqSecs: number = 1;
  private eventMap = new Map();
  private static self: Bitloops;

  constructor(config: BitloopsConfig) {
    this.authOptions = config.auth;
    this.config = config;
    sessionStorage.setItem('bitloops.config', JSON.stringify(config));
    this.auth.setBitloops(this);
  }

  public static getConfig() {
    const configString = sessionStorage.getItem('bitloops.config');
    return configString ? JSON.parse(configString) as BitloopsConfig : null;
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
      response.status === 401 && this.authOptions !== undefined &&
      this.authOptions.authenticationType === AuthTypes.FirebaseUser &&
      (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
    ) {
      const firebaseAuthOptions = (this.authOptions as IFirebaseAuthenticationOptions);
      const newAccessToken = firebaseAuthOptions.refreshTokenFunction ? await firebaseAuthOptions.refreshTokenFunction() : null;
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
    if (this.eventMap.size === 0) sessionStorage.removeItem('bitloops.subscriptionConnectionId');
    this.eventMap.set(namedEvent, callback);
    const subscriptionConnectionId = sessionStorage.getItem('bitloops.subscriptionConnectionId');
    const subscribeUrl = `${this.httpSecure()}://${this.config.server}/bitloops/events/subscribe/${
      subscriptionConnectionId ? subscriptionConnectionId : ''
    }`;

    const headers = this.getAuthHeaders();
    
    const response = await axios.post<string>(
      subscribeUrl,
      {
        topics: [namedEvent],
        workspaceId: this.config.workspaceId,
      },
      { headers }
    );
    if (!subscriptionConnectionId) {
      sessionStorage.setItem('bitloops.subscriptionConnectionId', response.data);
      this.setupEventSource(true);
    }

    const listenerCallback = (event: MessageEvent<any>) => {
      callback(JSON.parse(event.data));
    };

    this.subscribeConnection.addEventListener(namedEvent, listenerCallback);

    return () => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCallback);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();
    };
  }

  // private getAuthHeaderValues(
  //   authType: AuthTypes,
  //   authOptions: AuthenticationOptionsType
  // ): { token: string; providerId?: string } {
  //   let token: string;
  //   let providerId: string;
  //   switch (authType) {
  //     case AuthTypes.Basic:
  //       throw Error('Unimplemented');
  //     case AuthTypes.OAuth2:
  //       throw Error('Unimplemented');
  //     case AuthTypes.X_API_KEY:
  //       token = (authOptions as IAPIAuthenticationOptions).token;
  //       break;
  //     case AuthTypes.Token:
  //       throw Error('Unimplemented');
  //     case AuthTypes.User:
  //       providerId = (authOptions as any).providerId;
  //       token = '';
  //       break;
  //     case AuthTypes.FirebaseUser:
  //       token = (authOptions as IFirebaseAuthenticationOptions).user?.accessToken;
  //       providerId = (authOptions as IFirebaseAuthenticationOptions).providerId;
  //       return {
  //         token,
  //         providerId,
  //       };
  //     case AuthTypes.Anonymous:
  //       token = '';
  //       break;
  //     default:
  //       throw Error('Unimplemented');
  //   }
  //   return {
  //     token,
  //   };
  // }

  private httpSecure(): 'http' | 'https' {
    return this.config.ssl === false ? 'http' : 'https';
  }

  private getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized ' };
    const bitloopsConfigString = sessionStorage.getItem('bitloops.config');
    const bitloopsConfig = bitloopsConfigString ? JSON.parse(bitloopsConfigString) as BitloopsConfig : null;
    const config = Bitloops.getConfig();
    const user = auth.getUser();
    if (bitloopsConfig?.auth?.authenticationType === AuthTypes.User && user?.uid) {
      const bitloopsUserAuthOptions = config?.auth as IBitloopsAuthenticationOptions;
      headers['provider-id'] = bitloopsUserAuthOptions.providerId;
      headers['client-id'] = bitloopsUserAuthOptions.clientId;
      headers['Authorization'] = `User ${user.accessToken}`;
      headers['session-uuid'] = sessionStorage.getItem('sessionUuid');
    }
    return headers;
  }

  private sseReconnect() {
    setTimeout(() => {
      // console.log('Trying to reconnect sse with', this.reconnectFreqSecs);
      this.setupEventSource();
      this.reconnectFreqSecs = this.reconnectFreqSecs >= 60 ? 60 : this.reconnectFreqSecs * 2;
    }, this.reconnectFreqSecs * 1000);
  }

  private async resubscribe() {
    this.eventMap.forEach((callback, namedEvent) => {
      this.subscribe(namedEvent, callback);
    });
  }

  private setupEventSource(initialRun = false) {
    const subscriptionConnectionId = sessionStorage.getItem('bitloops.subscriptionConnectionId');
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
      this.subscribeConnection.close();
      if (
        error.status === 401 && this.authOptions &&
        this.authOptions.authenticationType === AuthTypes.FirebaseUser &&
        (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
      ) {
        new Promise(async (resolve, reject) => {
          if (
            error.status === 401 && this.authOptions &&
            this.authOptions?.authenticationType === AuthTypes.FirebaseUser &&
            (this.authOptions as IFirebaseAuthenticationOptions).refreshTokenFunction
          ) {
            /** On Auth error we can retry with same connId */
            const firebaseAuthOptions = (this.authOptions as IFirebaseAuthenticationOptions);
            const newAccessToken = firebaseAuthOptions.refreshTokenFunction ? await firebaseAuthOptions.refreshTokenFunction() : null;
            if (newAccessToken) {
              this.authOptions['user'].accessToken = newAccessToken;
              (headers['Authorization'] = `${this.authOptions.authenticationType} ${newAccessToken}`),
                (this.subscribeConnection = new EventSource(url, eventSourceInitDict));
              resolve(true);
            } else reject(error);
          }
        });
      } else {
        this.sseReconnect();
      }
    };
  }
}

export default Bitloops;
