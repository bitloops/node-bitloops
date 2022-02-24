import { BitloopsUser, Unsubscribe } from '../definitions';

export interface IAuthService {
  authenticateWithGoogle(serverParams?: ServerParams): Promise<void>;
  clearAuthentication(): Promise<void>;
  getUser(): Promise<BitloopsUser | null>;
  onAuthStateChange: (
    authChangeCallback: (user: BitloopsUser | null) => void,
  ) => Promise<Unsubscribe>;
}

export type ServerParams = {
  requestParams?: any;
  redirectUrl?: string;
};
