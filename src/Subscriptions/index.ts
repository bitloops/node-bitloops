import EventSource from 'eventsource-ts';
import {
  AuthTypes,
  BitloopsConfig,
  IInternalStorage,
  Unsubscribe,
  UnsubscribeParams,
} from '../definitions';
import HTTP from '../HTTP';

export default class ServerSentEvents {
  public static instance: ServerSentEvents;

  private http: HTTP;

  private storage: IInternalStorage;

  private config: BitloopsConfig;

  private subscribeConnection: EventSource;

  private subscriptionId: string = '';

  private readonly eventMap = new Map();

  private _sseIsBeingInitialized: boolean = false;

  private reconnectFreqSecs: number = 1;

  private constructor(http: HTTP, storage: IInternalStorage, config: BitloopsConfig) {
    this.http = http;
    this.config = config;
    this.storage = storage;
  }

  public static getInstance(http: HTTP, storage: IInternalStorage, config: BitloopsConfig) {
    if (!ServerSentEvents.instance) {
      ServerSentEvents.instance = new ServerSentEvents(http, storage, config);
    }
    return ServerSentEvents.instance;
  }

  private get sseIsBeingInitialized() {
    return this._sseIsBeingInitialized;
  }

  private set sseIsBeingInitialized(flagValue: boolean) {
    this._sseIsBeingInitialized = flagValue;
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
    /** Retry if connection is being initialized */
    if (this.subscriptionId === '' && this.sseIsBeingInitialized) {
      return new Promise((resolve) => {
        setTimeout(() => resolve(this.subscribe(namedEvent, callback)), 100);
      });
    }
    /** Set initializing flag if you are the initiator */
    if (this.subscriptionId === '' && this.sseIsBeingInitialized === false) {
      this.sseIsBeingInitialized = true;
    }

    /**
     * Becomes Critical section when subscriptionId = ''
     * and sse connection is being Initialized
     * If you are the initiator, response contains new subscriptionId from server
     */
    const { data: response, error } = await this.registerTopicORConnection(
      this.subscriptionId,
      namedEvent,
    );

    if (error || response === null) {
      console.error('registerTopicORConnection error', error);
      // console.error('registerTopicORConnection', error);
      this.sseIsBeingInitialized = false;
      // TODO differentiate errors - Throw on host unreachable
      throw new Error(`Got error response from REST:  ${JSON.stringify(error)}`);
    }
    console.log('registerTopicORConnection success', response.data);

    /** If you are the initiator, establish sse connection */
    if (this.sseIsBeingInitialized === true && this.subscriptionId === '') {
      this.subscriptionId = response.data;
      this.sseIsBeingInitialized = false;
      await this.setupEventSource();
    }
    /**
     * End of critical section
     */

    const listenerCallback = (event: MessageEvent<any>) => {
      console.log(`received event for namedEvent: ${namedEvent}`);
      callback(JSON.parse(event.data));
    };
    console.log(`add event listener for namedEvent: ${namedEvent}`);
    this.subscribeConnection.addEventListener(namedEvent, listenerCallback);

    return this.unsubscribe({ namedEvent, subscriptionId: this.subscriptionId, listenerCallback });
  }

  /**
   * Gets a new connection Id if called from the first subscriber
   * In all cases it registers the topic to the Connection Id
   * @param subscriptionId
   * @param namedEvent
   * @returns
   */
  private async registerTopicORConnection(subscriptionId: string, namedEvent: string) {
    const subscribeUrl = `${this.config.ssl === false ? 'http' : 'https'}://${
      this.config.server
    }/bitloops/events/subscribe/${subscriptionId}`;

    const headers = await this.getAuthHeaders();
    console.log('Sending headers', headers);
    return this.http.handler({
      url: subscribeUrl,
      method: 'POST',
      headers,
      data: { topics: [namedEvent], workspaceId: this.config.workspaceId },
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
  private unsubscribe({ subscriptionId, namedEvent, listenerCallback }: UnsubscribeParams) {
    return async (): Promise<void> => {
      this.subscribeConnection.removeEventListener(namedEvent, listenerCallback);
      console.log(`removed eventListener for ${namedEvent}`);
      this.eventMap.delete(namedEvent);
      if (this.eventMap.size === 0) this.subscribeConnection.close();

      const unsubscribeUrl = `${this.config.ssl === false ? 'http' : 'https'}://${
        this.config.server
      }/bitloops/events/unsubscribe/${subscriptionId}`;

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
      console.log(`Failed to resubscribe, retrying... in ${this.reconnectFreqSecs}`);
      this.subscribeConnection.close();
      this.sseReconnect();
    }
  }

  private async setupEventSource() {
    const { subscriptionId } = this;
    const url = `${this.config.ssl === false ? 'http' : 'https'}://${
      this.config.server
    }/bitloops/events/${subscriptionId}`;

    const headers = await this.getAuthHeaders();
    const eventSourceInitDict = { headers };

    // Need to subscribe with a valid subscriptionConnectionId, or rest will reject us
    this.subscribeConnection = new EventSource(url, eventSourceInitDict);
    // if (!initialRun) this.resubscribe();

    this.subscribeConnection.onopen = () => {
      this.reconnectFreqSecs = 1;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.subscribeConnection.onerror = (error: any) => {
      // on error, rest will clear our connectionId so we need to create a new one
      console.log('subscribeConnection.onerror, closing and re-trying', error);
      this.subscribeConnection.close();
      this.subscriptionId = '';
      this.sseReconnect();
    };
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
