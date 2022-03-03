import { IInternalStorage, BitloopsUser } from '../definitions';

const GHOST_STORAGE_ERROR_MESSAGE = 'This is a ghost storage this code should not have ran!';

class GhostStorage implements IInternalStorage {
  constructor(private readonly account = 'Bitloops') {}

  async saveSessionUuid(sessionId: string): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE + sessionId);
    console.log('error', error);
    return Promise.resolve();
  }

  async getSessionUuid(): Promise<string | null> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    console.log(error);
    return Promise.resolve(null);
  }

  async deleteSessionUuid(): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    console.log(error);
    return Promise.resolve();
  }

  async saveUser(bitloopsUser: BitloopsUser): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE + JSON.stringify(bitloopsUser));
    console.log(error);
    return Promise.resolve();
  }

  async getUser(): Promise<BitloopsUser | null> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    console.log(error);
    return Promise.resolve(null);
  }

  async deleteUser(): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    console.log(error);
    return Promise.resolve();
  }
}

export default GhostStorage;
