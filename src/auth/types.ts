import { BitloopsUser } from '../definitions';

export interface IAuthService {
  authenticateWithGoogle(serverParams?: ServerParams): Promise<void>;
  clearAuthentication(): Promise<void>;
  getUser(): Promise<BitloopsUser | null>;
}

export type ServerParams = {
  requestParams?: any;
  redirectUrl?: string;
};
