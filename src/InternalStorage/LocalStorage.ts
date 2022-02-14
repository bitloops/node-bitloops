import { BitloopsUser, IInternalStorage, StorageKeys } from '../definitions';

export default class LocalStorage implements IInternalStorage {
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

  async saveSessionUuid(sessionId: string): Promise<void> {
    localStorage.setItem(StorageKeys.SESSION_UUID, sessionId);
  }

  async getSessionUuid(): Promise<string | null> {
    return localStorage.getItem(StorageKeys.SESSION_UUID);
  }

  async deleteSessionUuid(): Promise<void> {
    localStorage.removeItem(StorageKeys.SESSION_UUID);
  }

  async saveUser(bitloopsUser: BitloopsUser): Promise<void> {
    localStorage.setItem(StorageKeys.USER_DATA, JSON.stringify(bitloopsUser));
  }

  async getUser(): Promise<BitloopsUser | null> {
    const userString = localStorage.getItem(StorageKeys.USER_DATA);
    return userString ? JSON.parse(userString) : null;
  }

  async deleteUser(): Promise<void> {
    localStorage.removeItem(StorageKeys.USER_DATA);
  }
}
