import jwt_decode from 'jwt-decode';
import open from 'open';
import {
  AuthTypes,
  IInternalStorage,
  BitloopsUser,
  BitloopsConfig,
  Unsubscribe,
  JWTData,
} from '../definitions';
import { IAuthService } from './types';
import HTTP from '../HTTP';
import { isTokenExpired, jwtToBitloopsUser } from '../helpers';
import AuthBase from './AuthBase';

type ServerParams = {
  requestParams?: any;
  redirectUrl?: string;
};

class AuthServer extends AuthBase implements IAuthService {
  authenticateWithGitHub(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  sendVerificationCode(phone: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  verifyPhoneCode(phone: string, code: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async authenticateWithGoogle(serverParams?: ServerParams) {
    const config = this.bitloopsConfig;
    if (!serverParams?.requestParams) {
      // console.log('where to redirect');
      // needs redirect-uri, to redirect to
      if (!serverParams?.redirectUrl) throw new Error('no redirect url');
      const { redirectUrl } = serverParams;
      const authorizeUrl = this.buildAuthorizeUrl(redirectUrl, config);
      // console.log('authorizeUrl', authorizeUrl);
      open(authorizeUrl);
    } else {
      // called on redirect from google
      // console.log('after redirect');
      const { requestParams, redirectUrl } = serverParams!;
      const { code } = requestParams;
      // console.log('code', code);
      // console.log('redirectUri', redirectUrl);
      await this.getTokens(code, redirectUrl as string, config);
      // console.log('ended redirect');
    }
  }

  async clearAuthentication() {
    const config = this.bitloopsConfig;
    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('AuthType must be User');
    }
    const user = await this.storage.getUser();
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
      const { error } = await this.http.handlerWithoutRetries({
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
      await this.storage.deleteUser();
    }
  }

  // registerWithGoogle() {} // TODO implement registration vs authentication

  /**
   * Returns the currently signed in user
   */
  async getUser(): Promise<BitloopsUser | null> {
    const config = this.bitloopsConfig;
    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('AuthType must be User');
    }
    const credsUser = await this.storage.getUser();
    if (credsUser === null) return null;
    const { accessToken, refreshToken } = credsUser;
    const isRefreshTokenExpired = isTokenExpired(refreshToken);
    const isAccessTokenExpired = isTokenExpired(accessToken);
    // console.log('isRefreshTokenExpired', isRefreshTokenExpired);
    // console.log('isAccessTokenExpired', isAccessTokenExpired);
    if (isRefreshTokenExpired) {
      console.log('refresh token expired');
      await this.storage.deleteUser();
      return null;
    }
    if (isAccessTokenExpired) {
      console.log('access token expired');
      const newUser = await this.refreshToken();
      const jwtData = jwt_decode<JWTData>(newUser.accessToken);
      return jwtToBitloopsUser(
        jwtData,
        newUser.accessToken,
        newUser.refreshToken,
        config.auth.providerId,
      );
    }
    const jwtData = jwt_decode<JWTData>(credsUser.accessToken);
    return jwtToBitloopsUser(
      jwtData,
      credsUser.accessToken,
      credsUser.refreshToken,
      config.auth.providerId,
    );
  }

  async onAuthStateChanged(): Promise<Unsubscribe> {
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
    // console.log('params', data);
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
    const { workspaceId, ssl, server, environmentId } = config;
    const headers = {
      Authorization: 'Unauthorized',
      'workspace-id': workspaceId,
      'environment-id': environmentId, // TODO not config.environmentId (OURS-system workflow);
      'workflow-id': 'e1d961e7-ed44-497c-bf8e-902fe29f41a7',
      'node-id': '08b7401e-bf41-4e24-9755-82d395253559',
      'Content-Type': 'application/json',
    };
    const body = {
      providerId,
      code,
      clientId,
      redirectUri: redirectUrl,
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
      console.error('Exchange tokens workflow failed', error, response);
      return;
    }

    if (!response) {
      console.error('unexpected error', error, response);
      throw new Error('Exchange tokens workflow failed');
    }
    const { data } = response.data;
    // console.log('workflow responded', data);
    const { access_token: accessToken, refresh_token: refreshToken } = data;
    const jwtData = jwt_decode<JWTData>(accessToken);
    const user = jwtToBitloopsUser(jwtData, accessToken, refreshToken, config.auth.providerId);
    this.storage.saveUser(user);
  }
}

export default AuthServer;
