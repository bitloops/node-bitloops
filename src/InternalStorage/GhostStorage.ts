import { IInternalStorage, BitloopsUser } from '../definitions';

const GHOST_STORAGE_ERROR_MESSAGE = 'This is a ghost storage this code should not have ran!';

class GhostStorage implements IInternalStorage {
  constructor(private readonly account = 'Bitloops') {}

  async saveSessionUuid(sessionId: string): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE + sessionId);
    return Promise.reject(error);
  }

  async getSessionUuid(): Promise<string | null> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    return Promise.reject(error);
  }

  async deleteSessionUuid(): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    return Promise.reject(error);
  }

  async saveUser(bitloopsUser: BitloopsUser): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE + JSON.stringify(bitloopsUser));
    return Promise.reject(error);
  }

  async getUser(): Promise<BitloopsUser | null> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    return Promise.reject(error);
  }

  async deleteUser(): Promise<void> {
    const error = new Error(GHOST_STORAGE_ERROR_MESSAGE);
    return Promise.reject(error);
  }
}

export default GhostStorage;
