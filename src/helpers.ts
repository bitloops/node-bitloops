import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { JWTData } from './definitions';
import { AxiosHandlerOutcome } from './HTTP/definitions';

export const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const isBrowser = () => typeof window !== 'undefined';

export const parseJwt = (token: string): any => {
  const jwtPayload = token.split('.')[1];
  const base64Payload = jwtPayload.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    Buffer.from(base64Payload, 'base64')
      .toString()
      .split('')
      .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
      .join(''),
  );
  return JSON.parse(jsonPayload);
};

/**
 * Parses the encoded JWT token and checks for its expiry
 *
 * @param token string, encoded jwt
 * @returns boolean, indication of whether the token is expired
 * or not
 */
export const isTokenExpired = (token: string): boolean => {
  const jwtData = parseJwt(token) as JWTData;
  const { exp } = jwtData;
  // console.log('expires at: ', new Date(exp * 1000));
  const isExpired = Date.now() >= exp * 1000;
  return isExpired;
};

export const isGoogleServerless = (): boolean => {
  if (process.env.K_SERVICE) return true;
  return false;
};
