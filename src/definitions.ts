import { AxiosError, AxiosResponse } from 'axios';

export type BitloopsUser = {
  displayName: string;
  firstName: string;
  lastName: string;
  uid: string;
  email: string;
  emailVerified: string;
  isAnonymous: boolean;
  providerId: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  photoURL?: string;
  sessionState: string;
} | null;

/** Removes subscribe listener */
export type Unsubscribe = () => void;

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
  authenticationType: AuthTypes;
  token: string;
  refreshTokenFunction?: never;
}

export interface IFirebaseAuthenticationOptions extends IAuthenticationOptions {
  authenticationType: AuthTypes;
  providerId: string;
  user: IFirebaseUser;
  refreshTokenFunction?: () => Promise<string | null>;
}
export interface IBitloopsAuthenticationOptions extends IAuthenticationOptions {
  authenticationType: AuthTypes;
  providerId: string;
  clientId: string;
  authChangeCallback: null | ((BitloopsUser) => void);
}

export type AuthenticationOptionsType =
  | IFirebaseAuthenticationOptions
  | IAPIAuthenticationOptions
  | IBitloopsAuthenticationOptions;

export type BitloopsConfig = {
  apiKey: string;
  server: string;
  environmentId: string;
  ssl?: boolean;
  workspaceId: string;
  messagingSenderId: string;
  auth?: AuthenticationOptionsType;
};

export type AxiosHandlerOutcome = [AxiosResponse, null] | [AxiosResponse | null, AxiosError] | [null, unknown];

export const enum LOCAL_STORAGE {
  USER_DATA = 'bitloops.auth.userData',
  BITLOOPS_CONFIG = 'bitloops.config',
}
