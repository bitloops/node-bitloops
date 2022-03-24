import { AuthTypes, BitloopsConfig, BitloopsUser, IInternalStorage } from '../definitions';
import HTTP from '../HTTP';

abstract class AuthBase {
  protected bitloopsConfig: BitloopsConfig;

  protected storage: IInternalStorage;

  protected http: HTTP;

  constructor(storage: IInternalStorage, http: HTTP, bitloopsConfig: BitloopsConfig) {
    this.bitloopsConfig = bitloopsConfig;
    this.storage = storage;
    this.http = http;
  }

  abstract clearAuthentication(): Promise<void>;

  /**
   * Tries to refresh token, token must be signed for our clientId,
   * and not expired for success
   */
  async refreshToken(): Promise<BitloopsUser> {
    const { bitloopsConfig: config } = this;
    const url = `${config?.ssl === false ? 'http' : 'https'}://${
      config?.server
    }/bitloops/auth/refreshToken`;
    const user = await this.storage.getUser();

    if (config.auth?.authenticationType !== AuthTypes.User) {
      throw new Error('Attempt to refresh token for non BitloopsUser AuthType');
    }
    if (!user?.refreshToken) throw new Error('no refresh token');
    const body = {
      refreshToken: user.refreshToken,
      clientId: config?.auth.clientId,
      providerId: config?.auth.providerId,
    };
    const { data: response, error } = await this.http.handlerWithoutRetries({
      url,
      method: 'POST',
      data: body,
    });
    if (error || response === null) {
      console.log('Refresh token was invalid', error);
      // invalid refresh token
      // clean refresh_token
      // logout user
      await this.clearAuthentication();
      return Promise.reject(error);
    }
    const newAccessToken = response.data.accessToken;
    const newRefreshToken = response.data.refreshToken;
    const newUser: BitloopsUser = {
      ...user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
    console.log('Updated refresh token', newUser);
    await this.storage.saveUser(newUser);
    return newUser;
  }
}

export default AuthBase;
