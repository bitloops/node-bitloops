import { BitloopsUser, Unsubscribe } from '../definitions';

export interface IAuthService {
  authenticateWithGoogle(serverParams?: ServerParams): Promise<void>;
  authenticateWithGitHub(): Promise<void>;
  clearAuthentication(): Promise<void>;
  getUser(): Promise<BitloopsUser | null>;
  onAuthStateChange: (
    authChangeCallback: (user: BitloopsUser | null) => void,
  ) => Promise<Unsubscribe>;
  sendVerificationCode(phone: string): Promise<void>;
  verifyPhoneCode(phone: string, code: string): Promise<void>;
  refreshToken(): Promise<BitloopsUser>;
}

export type ServerParams = {
  requestParams?: any;
  redirectUrl?: string;
};
