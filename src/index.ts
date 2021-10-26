import axios from 'axios';
import EventSource from 'eventsource';

export enum AuthTypes {
  Basic = 'Basic',
  X_API_KEY = 'x-api-key',
  Token = 'Token',
  FirebaseUser = 'FirebaseUser',
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
  ssl?: boolean;
  workspaceId: string;
  messagingSenderId: string;
};

class Bitloops {
  config: BitloopsConfig;
  authType: AuthTypes;
  authOptions: AuthenticationOptionsType | undefined;
  subscribeConnection: EventSource;

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

  public async r(requestId: string, options?: any): Promise<any> {
    return this.request(requestId, options);
  }

  public async request(requestId: string, options?: any): Promise<any> {
    if (!this.authOptions) {
      throw Error('Not authenticated');
    }
    let body = {
      messageId: requestId,
      workspaceId: this.config.workspaceId,
    };
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };

    const authHeaders = this.getAuthHeaders(this.authOptions.authenticationType, this.authOptions);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${this.authOptions.authenticationType} ${authHeaders.token}`,
    };
    if (authHeaders.providerId) headers['Provider-Id'] = authHeaders.providerId;

    const response = await axios.post(
      `${this.config.ssl === false ? 'http' : 'https'}://${this.config.server}/bitloops/request`,
      body,
      { headers }
    );
    return response.data;
  }

  public async p(messageId: string, options?: any): Promise<any> {
    return this.publish(messageId, options);
  }

  public async publish(messageId: string, options?: any): Promise<any> {
    if (!this.authOptions) {
      throw Error('Not authenticated');
    }
    let body = {
      messageId: messageId,
      workspaceId: this.config.workspaceId,
    };
    if (options?.payload) body = { ...body, ...options.payload };
    else if (options) body = { ...body, ...options };
    const authHeaders = this.getAuthHeaders(this.authOptions.authenticationType, this.authOptions);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${this.authOptions.authenticationType} ${authHeaders.token}`,
    };
    if (authHeaders.providerId) headers['Provider-Id'] = authHeaders.providerId;
    await axios.post(`${this.config.ssl === false ? 'http' : 'https'}://${this.config.server}/bitloops/publish`, body, {
      headers,
    });
    return true;
  }

  public subscribe(namedEvent: string) {
    if (!this.subscribeConnection) {
      this.initializeSubscribeConnection();
    }
    // sse.onmessage = (data) => {
    //   console.log('*->message');
    //   console.log(data);
    // };
    this.subscribeConnection.addEventListener(namedEvent, function (e) {
      //   if (e.origin != 'http://example.com') {
      //     console.error('Origin was not http://example.com');
      //     return;
      //   }
      console.log(e);
      // console.log(e.data)
    });
  }

  private getAuthHeaders(
    authType: AuthTypes,
    authOptions: AuthenticationOptionsType
  ): { token: string; providerId?: string } {
    let token: string;
    let providerId: string;
    switch (authType) {
      case AuthTypes.Basic:
        throw Error('Unimplemented');
      case AuthTypes.X_API_KEY:
        token = (authOptions as IAPIAuthenticationOptions).token;
        break;
      case AuthTypes.Token:
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

  // TODO re-initialize on jwt expiration?
  private initializeSubscribeConnection() {
    if (!this.authOptions) {
      throw Error('Not authenticated');
    }

    const url = `${this.config.ssl === false ? 'http' : 'https'}://${this.config.server}/events/${
      this.config.workspaceId
    }`;
    const authHeaders = this.getAuthHeaders(this.authOptions.authenticationType, this.authOptions);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `${this.authOptions.authenticationType} ${authHeaders.token}`,
    };

    if (authHeaders.providerId) headers['Provider-Id'] = authHeaders.providerId;
    const eventSourceInitDict = { headers };
    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
  }
}

export default Bitloops;
