import EventSource from 'eventsource-ts';
import { v4 as uuid } from 'uuid';
import {
  AuthTypes,
  BitloopsConfig,
  IInternalStorage,
  Unsubscribe,
  UnsubscribeParams,
  ListenerCallback,
} from '../definitions';
import HTTP from '../HTTP';
import NetworkRestError from '../HTTP/errors/NetworkRestError';
import { Mutex } from 'async-mutex';

export default class ServerSentEvents {
  public static instance: ServerSentEvents;

  private http: HTTP;

  private storage: IInternalStorage;

  private config: BitloopsConfig;

  private subscribeConnection: EventSource;

  private subscriptionId: string = '';

  private readonly eventMap = new Map();

  private reconnectFreqSecs: number = 1;

  private mutex: Mutex;

  private constructor(http: HTTP, storage: IInternalStorage, config: BitloopsConfig) {
    this.http = http;
    this.config = config;
    this.storage = storage;
    this.mutex = new Mutex();
  }

  public static getInstance(http: HTTP, storage: IInternalStorage, config: BitloopsConfig) {
    if (!ServerSentEvents.instance) {
      ServerSentEvents.instance = new ServerSentEvents(http, storage, config);
    }
    return ServerSentEvents.instance;
  }

  /**
   * @param namedEvent
   * @event Triggers callback when messages are pushed
   */
  public async subscribe<DataType>(
    namedEvent: string,
    callback: (data: DataType) => void,
  ): Promise<Unsubscribe> {
    console.log('subscribing topic:', namedEvent);
    this.eventMap.set(namedEvent, callback);
    const listenerCallback = this.setupListenerCallback(namedEvent, callback);

    const release = await this.mutex.acquire();
    console.log('I acquired the lock')
    /** If you are the initiator, establish sse connection */
    if (this.subscriptionId === '') {
      this.subscriptionId = uuid();
      try {
        await this.setupEventSource();
      } catch (err) {
        return this.unsubscribe({ namedEvent, listenerCallback });
      } finally {
        release();
        console.log('I released the lock')
      }
    }
    console.log('first this.subscriptionId', this.subscriptionId);
    // console.log('first this.sseIsBeingInitialized', this.sseIsBeingInitialized);

    // if (this.sseIsBeingInitialized) {
    //   console.log("Is not initialized");
    //   return new Promise((resolve) => {
    //     setTimeout(() => resolve(this.subscribe(namedEvent, callback)), 100);
    //   });
    // }

    console.log('this.subscriptionId', this.subscriptionId);
    // console.log('this.sseIsBeingInitialized', this.sseIsBeingInitialized);
    const { data: response, error } = await this.registerTopicORConnection(
      this.subscriptionId,
      namedEvent,
    );

    if (error || response === null) {
      // console.error('registerTopicORConnection error:', error);
      // TODO differentiate errors - Throw on host unreachable
      if (error instanceof NetworkRestError)
        console.error(`Got error response from REST: ${error}`);
      return async () => { };
    }
    console.log('registerTopicORConnection result:', response?.data);

    console.log(`add event listener for namedEvent: ${namedEvent}`);
    this.subscribeConnection.addEventListener(namedEvent, listenerCallback);

    return this.unsubscribe({ namedEvent, listenerCallback });
  }

  private setupListenerCallback<DataType>(namedEvent: string, callback: (data: DataType) => void): ListenerCallback {
    return (event: MessageEvent<any>) => {
      console.log(`received event for namedEvent: ${namedEvent}`);
      callback(JSON.parse(event.data));
    }
  }

  /**
   * Gets a new connection Id if called from the first subscriber
   * In all cases it registers the topic to the Connection Id
   * @param subscriptionId
   * @param namedEvent
   * @returns
   */
  private async registerTopicORConnection(subscriptionId: string, namedEvent: string) {
    const subscribeUrl = `${this.config.ssl === false ? 'http' : 'https'}://${this.config.server
      }/bitloops/events/subscribe/${subscriptionId}`;

    const headers = await this.getAuthHeaders();
    // console.log('Sending headers', headers);
    return this.http.handler({
      url: subscribeUrl,
      method: 'POST',
      headers,
      data: { topic: namedEvent, workspaceId: this.config.workspaceId },
    });
  }

  /**
   * Removes event listener from subscription.
   * Deletes events from mapping that had been subscribed.
   * Handles remaining dead subscription connections, in order to not send events.
   * @param subscriptionId
   * @param namedEvent
   * @param listenerCallback
   * @returns void
   */
  private unsubscribe({ namedEvent, listenerCallback }: UnsubscribeParams) {
    return async (): Promise<void> => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCallback);
      console.log(`removed eventListener for ${namedEvent}`);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();

      const unsubscribeUrl = `${this.config.ssl === false ? 'http' : 'https'}://${this.config.server
        }/bitloops/events/unsubscribe/${this.subscriptionId}`;

      const headers = await this.getAuthHeaders();

      await this.http.handler({
        url: unsubscribeUrl,
        method: 'POST',
        headers,
        data: { workspaceId: this.config.workspaceId, topic: namedEvent },
      });
    };
  }

  /**
   * Ask for new connection
   */
  private sseReconnect() {
    setTimeout(async () => {
      console.log('Trying to reconnect sse with', this.reconnectFreqSecs);
      this.reconnectFreqSecs = this.reconnectFreqSecs >= 60 ? 60 : this.reconnectFreqSecs * 2;
      return this.tryToResubscribe();
    }, this.reconnectFreqSecs * 1000);
  }

  private async tryToResubscribe() {
    console.log('Attempting to resubscribe');
    // console.log(' this.eventMap.length', this.eventMap.size);
    const subscribePromises = Array.from(this.eventMap.entries()).map(([namedEvent, callback]) =>
      this.subscribe(namedEvent, callback),
    );
    try {
      // console.log('this.eventMap length', subscribePromises.length);
      await Promise.all(subscribePromises);
      console.log('Resubscribed all topics successfully!');
      // All subscribes were successful => done
    } catch (error) {
      // >= 1 subscribes failed => retry
      // console.log(`Failed to resubscribe, retrying... in ${this.reconnectFreqSecs}`);
      // this.subscribeConnection.close();
      // this.sseReconnect();
    }
  }

  private async setupEventSource() {
    return new Promise<void>(async (resolve, reject) => {

      const server = this.config.eventServer ?? this.config.server;
      const url = `${this.config.ssl === false ? 'http' : 'https'}://${server
        }/bitloops/events/${this.subscriptionId}`;

      const headers = await this.getAuthHeaders();
      const eventSourceInitDict = { headers };

      this.subscribeConnection = new EventSource(url, eventSourceInitDict);
      this.subscribeConnection.onopen = () => {
        console.log("The connection has been established.");
        // this.sseIsBeingInitialized = false;
        this.reconnectFreqSecs = 1;
        return resolve();
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.subscribeConnection.onerror = (error: any) => {
        // on error, ermis will clear our connectionId so we need to create a new one
        console.log('subscribeConnection.onerror, closing and re-trying', error);
        this.subscribeConnection.close();
        this.subscriptionId = '';
        // this.sseIsBeingInitialized = true;
        this.sseReconnect();
        return reject(error);
      };
    })
  }

  /**
   *
   * @returns
   */
  private async getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Unauthorized ' };
    const { config } = this;
    const user = await this.storage.getUser();
    if (config?.auth?.authenticationType === AuthTypes.User && user?.uid) {
      const sessionUuid = await this.storage.getSessionUuid();
      headers['provider-id'] = config?.auth.providerId;
      headers['client-id'] = config?.auth.clientId;
      headers.Authorization = `User ${user.accessToken}`;
      headers['session-uuid'] = sessionUuid;
    }
    return headers;
  }
}
