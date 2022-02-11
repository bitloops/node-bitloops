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
};

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

export interface IAPIAuthenticationOptions {
  authenticationType: AuthTypes.X_API_KEY;
  token: string;
  refreshTokenFunction?: never;
}

export interface IFirebaseAuthenticationOptions {
  authenticationType: AuthTypes.FirebaseUser;
  providerId: string;
  user: IFirebaseUser;
  refreshTokenFunction?: () => Promise<string | null>;
}

export interface IBitloopsAuthenticationOptions {
  authenticationType: AuthTypes.User;
  providerId: string;
  clientId: string;
}

export interface IBitloopsAuthenticationLocalStorageOptions extends IAuthenticationOptions {
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
  applications?: string[];
  auth?: AuthenticationOptionsType;
};

// export type AxiosHandlerOutcome = [AxiosResponse, null] | [AxiosResponse | null, AxiosError] | [null, unknown];
export type AxiosHandlerOutcome = AxiosDataResponse | AxiosErrorResponse | AxiosUnexpectedResponse;

type AxiosDataResponse = {
  data: AxiosResponse;
  error: null;
};

type AxiosErrorResponse = {
  data: AxiosResponse | undefined;
  error: AxiosError;
};

type AxiosUnexpectedResponse = {
  data: null;
  error: unknown;
};

export const enum LOCAL_STORAGE {
  USER_DATA = 'bitloops.auth.userData',
  BITLOOPS_CONFIG = 'bitloops.config',
  SUBSCRIPTION_ID = 'bitloops.subscriptionConnectionId',
  SESSION_UUID = 'sessionUuid',
  // ACCESS_TOKEN = 'bitloops.auth.accessToken',
  // REFRESH_TOKEN = 'bitloops.auth.refreshToken',
}

export type JWTData = {
  exp: number;
  iat: number;
  auth_time: number;
  jti: string;
  iss: string;
  aud: string;
  sub: string;
  typ: string;
  azp: string;
  session_state: string;
  acr: string;
  realm_access: {
    roles: string[];
  };
  resource_access: { account: { roles: any } };
  scope: string;
  sid: string;
  email_verified: boolean;
  name: string;
  preferred_username: string;
  given_name: string;
  family_name: string;
  email: string;
  photoURL: string;
};

export interface IInternalStorage {
  // saveBitloopsConfig: (bitloopsConfig: BitloopsConfig) => void;
  // getBitloopsConfig: () => BitloopsConfig | null;

  // saveSubscriptionId: (subscriptionId: string) => void;
  // getSubscriptionId: () => string | null;
  // deleteSubscriptionId: () => void;

  saveSessionUuid: (sessionId: string) => void;
  getSessionUuid: () => string | null;
  deleteSessionUuid: () => void;

  saveUser: (bitloopsUser: BitloopsUser) => void;
  getUser: () => BitloopsUser | null;
  deleteUser: () => void;
}
