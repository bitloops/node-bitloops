import { BitloopsUser, IInternalStorage, LOCAL_STORAGE } from '../definitions';

// TODO decide if globalObject is the best choice
class GlobalObject implements IInternalStorage {
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

  saveSessionUuid(sessionId: string) {
    global[LOCAL_STORAGE.SESSION_UUID] = sessionId;
  }

  getSessionUuid() {
    return global[LOCAL_STORAGE.SESSION_UUID];
  }

  deleteSessionUuid(): void {
    delete global[LOCAL_STORAGE.SESSION_UUID];
  }

  saveUser(bitloopsUser: BitloopsUser): void {
    global[LOCAL_STORAGE.USER_DATA] = bitloopsUser;
  }

  getUser(): BitloopsUser {
    return global[LOCAL_STORAGE.USER_DATA];
  }

  deleteUser(): void {
    delete global[LOCAL_STORAGE.USER_DATA];
  }
}

export default GlobalObject;
