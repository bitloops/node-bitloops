import keytar from 'keytar';
import { BitloopsUser, IInternalStorage, StorageKeys } from '../definitions';

// TODO decide if globalObject is the best choice
class GlobalObject implements IInternalStorage {
  constructor(private readonly account = 'Bitloops') {}
  //   saveBitloopsConfig(bitloopsConfig: BitloopsConfig) {
  //     global[LOCAL_STORAGE.BITLOOPS_CONFIG] = bitloopsConfig;
  //   }

  //   getBitloopsConfig(): BitloopsConfig {
  //     return global[LOCAL_STORAGE.BITLOOPS_CONFIG];
  //   }

  //   saveSubscriptionId(subscriptionId: string) {
  //     global[LOCAL_STORAGE.SUBSCRIPTION_ID] = subscriptionId;
  //   }
  //   getSubscriptionId() {
  //     return global[LOCAL_STORAGE.SUBSCRIPTION_ID];
  //   }
  //   deleteSubscriptionId() {
  //     delete global[LOCAL_STORAGE.SUBSCRIPTION_ID];
  //   }

  async saveSessionUuid(sessionId: string): Promise<void> {
    return keytar.setPassword(StorageKeys.SESSION_UUID, this.account, sessionId);
  }

  async getSessionUuid(): Promise<string | null> {
    return keytar.getPassword(StorageKeys.SESSION_UUID, this.account);
  }

  async deleteSessionUuid(): Promise<void> {
    const result = await keytar.deletePassword(StorageKeys.SESSION_UUID, this.account);
    if (result === false) Promise.reject(result);
  }

  async saveUser(bitloopsUser: BitloopsUser): Promise<void> {
    return keytar.setPassword(StorageKeys.USER_DATA, this.account, JSON.stringify(bitloopsUser));
  }

  async getUser(): Promise<BitloopsUser | null> {
    const result = await keytar.getPassword(StorageKeys.USER_DATA, this.account);
    return result ? JSON.parse(result) : null;
  }

  async deleteUser(): Promise<void> {
    const result = await keytar.deletePassword(StorageKeys.USER_DATA, this.account);
    if (result === false) Promise.reject(result);
  }
}

export default GlobalObject;
