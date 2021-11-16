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
}

export interface IFirebaseAuthenticationOptions extends IAuthenticationOptions {
  providerId: string;
  user: IFirebaseUser;
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

class Bitloops {
  config: BitloopsConfig;
  authType: AuthTypes;
  authOptions: AuthenticationOptionsType | undefined;
  subscribeConnection: EventSource;
  subscribeConnectionId: string = '';

  constructor(config: BitloopsConfig) {
    this.config = config;
  }

  public static async initialize(config: BitloopsConfig): Promise<Bitloops> {
    return new Bitloops(config);
  }

  public authenticate(options: IFirebaseAuthenticationOptions | IAPIAuthenticationOptions): void {
    this.authOptions = options;
  }

  public signOut(): void {
    this.authOptions = undefined;
  }

  public async r(workflowId: string, options?: any): Promise<any> {
    return this.request(workflowId, options);
  }

  public async request(workflowId: string, options?: any): Promise<any> {
    const headers = this.getAuthHeaders();
    headers['workspace-id'] = this.config.workspaceId;
    headers['environment-id'] = this.config.environmentId;
    headers['workflow-id'] = workflowId;
    let body = {};
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    const response = await axios.post(`${this.httpSecure()}://${this.config.server}/bitloops/request`, body, {
      headers,
    });
    return response.data;
  }

  public async p(messageId: string, options?: any): Promise<any> {
    return this.publish(messageId, options);
  }

  public async publish(messageId: string, options?: any): Promise<any> {
    const headers = this.getAuthHeaders();
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

  public async subscribe<dataType>(namedEvent: string, callback: (data: dataType) => void) {
    const subscribeUrl = `${this.httpSecure()}://${this.config.server}/events/subscribe/${this.subscribeConnectionId}`;

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
      this.initializeSubscribeConnection();
    }

    this.subscribeConnection.addEventListener(namedEvent, (event) => {
      callback(JSON.parse(event.data));
    });
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

  // TODO re-initialize on jwt expiration?
  private initializeSubscribeConnection() {
    const url = `${this.httpSecure()}://${this.config.server}/events/${this.subscribeConnectionId}`;

    const headers = this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    this.subscribeConnection.onerror = (error) => {
      // console.log('subscribeConnection error', error, 'closing sse connection...');
      this.subscribeConnection.close();
    };
  }
}

export default Bitloops;
