import open from 'open';
import axios from 'axios';
import {
  AuthTypes,
  IInternalStorage,
  BitloopsUser,
  BitloopsConfig,
  Unsubscribe,
} from '../definitions';
// eslint-disable-next-line import/no-cycle
import Bitloops from '../index';
import { IAuthService } from './types';

type ServerParams = {
  requestParams?: any;
  redirectUrl?: string;
};

class AuthServer implements IAuthService {
  private bitloops: Bitloops;

  private storage: IInternalStorage;

  constructor(bitloops: Bitloops, storage: IInternalStorage) {
    this.bitloops = bitloops;
    this.storage = storage;
  }

  async authenticateWithGoogle(serverParams?: ServerParams) {
    const config = this.bitloops.getConfig();
    if (!serverParams?.requestParams) {
      console.log('where to redirect');
      // needs redirect-uri, to redirect to
      if (!serverParams?.redirectUrl) throw new Error('no redirect url');
      const { redirectUrl } = serverParams;
      const authorizeUrl = this.buildAuthorizeUrl(redirectUrl, config);
      console.log('authorizeUrl', authorizeUrl);
      open(authorizeUrl);
    } else {
      // called on redirect from google
      console.log('after redirect');
      const { requestParams, redirectUrl } = serverParams!;
      const { code } = requestParams;
      console.log('code', code);
      console.log('redirectUri', redirectUrl);
      await this.getTokens(code, redirectUrl as string, config);
      console.log('ended redirect');
    }
  }

  async clearAuthentication() {
    const config = this.bitloops.getConfig();
    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('AuthType must be User');
    }
    const user = await this.getUser();
    if (user === null) throw new Error('Not currently logged in');
    if (user && config) {
      const { accessToken, refreshToken } = user;
      const body = {
        accessToken,
        clientId: config.auth.clientId,
        providerId: config.auth.providerId,
        refreshToken,
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

  async onAuthStateChange(): Promise<Unsubscribe> {
    throw new Error('Unimplemented');
  }

  private buildAuthorizeUrl(redirectUrl: string, config: BitloopsConfig): string {
    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('AuthType must be User');
    }

    const data = {
      client_id: config?.auth?.clientId,
      response_type: 'code',
      redirect_uri: redirectUrl,
    };
    console.log('params', data);
    const params = new URLSearchParams(data).toString();
    const BITLOOPS_REST_URL = `${config?.ssl ? 'https' : 'http'}://${
      config?.server
    }/bitloops/auth/providers/bitloops/protocol/openid-connect`;

    const authorizeUrl = `${BITLOOPS_REST_URL}/auth?${params}`;
    return authorizeUrl;
  }

  private async getTokens(
    code: string,
    redirectUrl: string,
    config: BitloopsConfig,
  ): Promise<void> {
    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('AuthType must be User');
    }

    const { clientId, providerId } = config.auth;
    console.log('clientId', clientId);
    console.log('providerId', providerId);
    const response = await this.bitloops.r(
      'e1d961e7-ed44-497c-bf8e-902fe29f41a7',
      '08b7401e-bf41-4e24-9755-82d395253559',
      {
        providerId,
        code,
        clientId,
        redirectUri: redirectUrl,
      },
    );
    console.log('response received', response);
    const { data } = response;
    console.log('workflow responsed', data);
    const { access_token: accessToken, refresh_token: refreshToken } = data;
    const user = {
      accessToken,
      refreshToken,
    } as BitloopsUser;
    this.storage.saveUser(user);
  }
}

export default AuthServer;
