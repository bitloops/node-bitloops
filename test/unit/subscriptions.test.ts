import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { v4 as uuid } from 'uuid';
import EventSource from 'eventsource';
import Bitloops, { AuthTypes } from '../../src';

const bitloopsConfig = {
  apiKey: 'kgyst344ktst43kyygk4tkt4s',
  server: 'localhost:3005',
  environmentId: 'development',
  ssl: false,
  workspaceId: 'db24bb48-d2e3-4433-8fd0-79eef2bf63df',
  messagingSenderId: '742387243782',
  auth: {
    authenticationType: AuthTypes.X_API_KEY,
    token: 'xrPA9_%Hx-#R@+$6px2+WVj-Ndw^a4W2',
  },
};

// Partial<EventSource>
const mockEventSource = {
  addEventListener: (namedEvent: string, listenerCallback) => {
    console.log('addEventListener called');
    // pass
  },
  removeEventListener: (namedEvent: string) => {
    console.log('removeEventListener called');
  },
  close: () => {
    console.log('event source close called');
  },
} as any;

describe('sse', () => {
  beforeAll(() => {
    const localStorageMock = {};
    Storage.prototype.getItem = jest.fn((key) => {
      return localStorageMock[key] ?? null;
    });

    Storage.prototype.setItem = jest.fn((key, value) => {
      localStorageMock[key] = value;
    });
  });
  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should add 2 subscribes and create a new connection', async () => {
    const SUBJECT_ONE = 'hello-topic';
    const SUBJECT_TWO = 'hello-topic-2';
    const bitloops = Bitloops.initialize(bitloopsConfig);
    const registerTopicOrConnection = jest.spyOn(bitloops as any, 'registerTopicORConnection');
    const setupEventSource = jest.spyOn(bitloops as any, 'setupEventSource');

    bitloops['subscribeConnection'] = mockEventSource;
    registerTopicOrConnection.mockImplementation((subscriptionConnectionId, namedEvent) => {
      if (subscriptionConnectionId === '') {
        return [{ data: uuid(), status: 201 }, null];
      } else {
        return [{ status: 204 }, null];
      }
    });

    setupEventSource.mockImplementation(() => {});

    const unsubscribe = await bitloops.subscribe<string>(SUBJECT_ONE, (data) => {
      console.log(data);
    });

    const [response, error] = registerTopicOrConnection.mock.results[0].value;
    const connectionId = response.data;

    const unsubscribe2 = await bitloops.subscribe<string>(SUBJECT_TWO, (data) => {
      console.log(data);
    });
    expect(1).toBe(1);
    expect(registerTopicOrConnection).toBeCalledTimes(2);
    unsubscribe();
    unsubscribe2();

    expect(registerTopicOrConnection.mock.calls[0][0]).toBe('');
    expect(registerTopicOrConnection.mock.calls[0][1]).toBe(SUBJECT_ONE);

    expect(registerTopicOrConnection.mock.calls[1][0]).toBe(connectionId);
    expect(registerTopicOrConnection.mock.calls[1][1]).toBe(SUBJECT_TWO);
    expect(setupEventSource).toBeCalledTimes(1);
  });
});
