import { BitloopsConfig, BitloopsUser, IInternalStorage, LOCAL_STORAGE } from '../definitions';

export class LocalStorage implements IInternalStorage {
  //   saveBitloopsConfig(bitloopsConfig: BitloopsConfig) {
  //     localStorage.setItem(LOCAL_STORAGE.BITLOOPS_CONFIG, JSON.stringify(bitloopsConfig));
  //   }

  //   getBitloopsConfig(): BitloopsConfig {
  //     const configString = localStorage.getItem(LOCAL_STORAGE.BITLOOPS_CONFIG);
  //     return configString ? JSON.parse(configString) : null;
  //   }

  //   saveSubscriptionId(subscriptionId: string) {
  //     localStorage.setItem(LOCAL_STORAGE.SUBSCRIPTION_ID, subscriptionId);
  //   }
  //   getSubscriptionId() {
  //     return localStorage.getItem(LOCAL_STORAGE.SUBSCRIPTION_ID);
  //   }
  //   deleteSubscriptionId() {
  //     localStorage.removeItem(LOCAL_STORAGE.SUBSCRIPTION_ID);
  //   }

  saveSessionUuid(sessionId: string) {
    localStorage.setItem(LOCAL_STORAGE.SESSION_UUID, sessionId);
  }
  getSessionUuid() {
    return localStorage.getItem(LOCAL_STORAGE.SESSION_UUID);
  }
  deleteSessionUuid(): void {
    localStorage.removeItem(LOCAL_STORAGE.SESSION_UUID);
  }

  saveUser(bitloopsUser: BitloopsUser): void {
    localStorage.setItem(LOCAL_STORAGE.USER_DATA, JSON.stringify(bitloopsUser));
  }
  getUser(): BitloopsUser {
    const userString = localStorage.getItem(LOCAL_STORAGE.USER_DATA);
    return userString ? JSON.parse(userString) : null;
  }
  deleteUser(): void {
    localStorage.removeItem(LOCAL_STORAGE.USER_DATA);
  }
}
