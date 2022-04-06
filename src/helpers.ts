import jwt_decode from 'jwt-decode';
import { BitloopsUser, JWTData } from './definitions';

export const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isBrowser = () => typeof window !== 'undefined';

/**
 * Parses the encoded JWT token and checks for its expiry
 *
 * @param token string, encoded jwt
 * @returns boolean, indication of whether the token is expired
 * or not
 */
export const isTokenExpired = (token: string): boolean => {
  const jwtData = jwt_decode<JWTData>(token);
  const { exp } = jwtData;
  // console.log('expires at: ', new Date(exp * 1000));
  const isExpired = Date.now() >= exp * 1000;
  return isExpired;
};

export const isGoogleServerless = (): boolean => {
  if (process.env.K_SERVICE) return true;
  return false;
};

export const jwtToBitloopsUser = (
  jwtData: JWTData,
  token: string,
  refreshToken: string,
  providerId: string,
): BitloopsUser => ({
  accessToken: token,
  refreshToken,
  sessionState: jwtData.session_state,
  uid: jwtData.sub,
  displayName: jwtData.name ?? jwtData.preferred_username,
  firstName: jwtData.given_name,
  lastName: jwtData.family_name,
  email: jwtData.email,
  emailVerified: jwtData.email_verified,
  isAnonymous: false,
  providerId,
  clientId: jwtData.azp,
  photoURL: jwtData.photoURL,
});
