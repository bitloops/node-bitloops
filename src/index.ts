import axios from 'axios';
import EventSource from 'eventsource';

export enum AuthTypes {
  Anonymous = 'Anonymous',
  Basic = 'Basic',
  X_API_KEY = 'X-API-Key',
  Token = 'Token',
  User = 'User',
  FirebaseUser = 'FirebaseUser',
  OAuth2 = 'OAuth2',
}

export interface IFirebaseUser {
  accessToken: string;
}

export interface IAuthenticationOptions {
  authenticationType: AuthTypes;
}

export interface IAPIAuthenticationOptions extends IAuthenticationOptions {
  token: string;
  refreshTokenFunction?: never;
}

export interface IFirebaseAuthenticationOptions extends IAuthenticationOptions {
  providerId: string;
  user: IFirebaseUser;
  refreshTokenFunction?: () => Promise<string | null>;
}

export type AuthenticationOptionsType = IFirebaseAuthenticationOptions | IAPIAuthenticationOptions;

export type BitloopsConfig = {
  apiKey: string;
  server: string;
  environmentId: string;
  ssl?: boolean;
  workspaceId: string;
  messagingSenderId: string;
};

/** Removes subscribe listener */
type UnSubscribe = () => void;

class Bitloops {
  config: BitloopsConfig;
  authType: AuthTypes;
  authOptions: AuthenticationOptionsType | undefined;
  private subscribeConnection: EventSource;
  private subscribeConnectionId: string = '';
  private reconnectFreqSecs: number = 1;
  private eventMap = new Map();

  constructor(config: BitloopsConfig) {
    this.config = config;
  }

  public static initialize(config: BitloopsConfig): Bitloops {
    return new Bitloops(config);
  }

  public authenticate(options: IFirebaseAuthenticationOptions | IAPIAuthenticationOptions): void {
    this.authOptions = options;
  }

  public signOut(): void {
    this.authOptions = undefined;
  }

  public async r(workflowId: string, nodeId: string, options?: any): Promise<any> {
    return this.request(workflowId, nodeId, options);
  }

  public async request(workflowId: string, nodeId: string, options?: any): Promise<any> {
    const headers = this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['workflow-id'] = workflowId;
    headers['node-id'] = nodeId;
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
      this.authOptions?.authenticationType === AuthTypes.FirebaseUser &&
      this.authOptions?.refreshTokenFunction
    ) {
      const newAccessToken = await this.authOptions.refreshTokenFunction();
      if (newAccessToken) {
        this.authOptions.user.accessToken = newAccessToken;
        (headers.Authorization = `${this.authOptions.authenticationType} ${newAccessToken}`),
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

  public async subscribe<dataType>(namedEvent: string, callback: (data: dataType) => void): Promise<UnSubscribe> {
    this.eventMap.set(namedEvent, callback);
    const subscribeUrl = `${this.httpSecure()}://${this.config.server}/bitloops/events/subscribe/${
      this.subscribeConnectionId
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

    if (!this.subscribeConnectionId) {
      this.subscribeConnectionId = response.data;
      this.setupEventSource();
    }

    const listenerCb = (event: MessageEvent<any>) => {
      callback(JSON.parse(event.data));
    }

    this.subscribeConnection.addEventListener(namedEvent, listenerCb);

    return () => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCb);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();
    }
  }

  private getAuthHeaderValues(
    authType: AuthTypes,
    authOptions: AuthenticationOptionsType
  ): { token: string; providerId?: string } {
    let token: string;
    let providerId: string;
    switch (authType) {
      case AuthTypes.Basic:
        throw Error('Unimplemented');
      case AuthTypes.OAuth2:
        throw Error('Unimplemented');
      case AuthTypes.X_API_KEY:
        token = (authOptions as IAPIAuthenticationOptions).token;
        break;
      case AuthTypes.Token:
        throw Error('Unimplemented');
      case AuthTypes.User:
        throw Error('Unimplemented');
      case AuthTypes.FirebaseUser:
        token = (authOptions as IFirebaseAuthenticationOptions).user?.accessToken;
        providerId = (authOptions as IFirebaseAuthenticationOptions).providerId;
        return {
          token,
          providerId,
        };
      case AuthTypes.Anonymous:
        token = '';
        break;
      default:
        throw Error('Unimplemented');
    }
    return {
      token,
    };
  }
  private httpSecure(): 'http' | 'https' {
    return this.config.ssl === false ? 'http' : 'https';
  }

  private getAuthHeaders() {
    if (!this.authOptions) {
      throw Error('Not authenticated');
    }
    const authHeaders = this.getAuthHeaderValues(this.authOptions.authenticationType, this.authOptions);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${this.authOptions.authenticationType} ${authHeaders.token}`,
    };
    if (authHeaders.providerId) headers['Provider-Id'] = authHeaders.providerId;
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
    })
  }

  private setupEventSource() {
    const url = `${this.httpSecure()}://${this.config.server}/bitloops/events/${this.subscribeConnectionId}`;

    const headers = this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    this.resubscribe();

    this.subscribeConnection.onopen = (e: any) => {
      // console.log('Resetting retry timer...')
      this.reconnectFreqSecs = 1;
    }

    this.subscribeConnection.onerror = (error: any) => {
      this.subscribeConnection.close();
      if (
        error.status === 401 &&
        this.authOptions?.authenticationType === AuthTypes.FirebaseUser &&
        this.authOptions?.refreshTokenFunction
      ) {
        new Promise(async (resolve, reject) => {
          if (
            error.status === 401 &&
            this.authOptions?.authenticationType === AuthTypes.FirebaseUser &&
            this.authOptions?.refreshTokenFunction
          ) {
            /** On Auth error we can retry with same connId */
            const newAccessToken = await this.authOptions.refreshTokenFunction();
            if (newAccessToken) {
              this.authOptions.user.accessToken = newAccessToken;
              (headers.Authorization = `${this.authOptions.authenticationType} ${newAccessToken}`),
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
