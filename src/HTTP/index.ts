import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { AxiosHandlerOutcome } from './definitions';
import CanceledRequestError from './errors/CanceledRequestError';
import { CANCEL_REQUEST_MSG } from './errors/definitions';
import NetworkRestError from './errors/NetworkRestError';

type InterceptRequest = (config: AxiosRequestConfig<any>) => Promise<any>;
/*
 * If business login interceptor returns true,
 * we retry the request, if it returns false,
 * we rejectPromise the initial error
 */
type InterceptResponseError = (error: any) => Promise<boolean>;

/** Plain http post and get requests
 * They can be either intercepted or not
 */
export default class HTTP {
  private axiosInstance: AxiosInstance;

  public constructor();
  public constructor(interceptRequest: InterceptRequest, interceptResponse: InterceptResponseError);

  public constructor(...args: any[]) {
    if (args.length === 0) {
      // console.log('Used constructor 1');
      this.axiosInstance = axios;
      return;
    }
    if (args.length === 2) {
      // console.log('Used constructor 2');
      const [interceptRequest, interceptResponse] = args;
      this.axiosInstance = this.interceptAxiosInstance(interceptRequest, interceptResponse);
      return;
    }
    throw new Error('Undefined constructor.');
  }

  public async handler(config: AxiosRequestConfig): Promise<AxiosHandlerOutcome> {
    try {
      const response = await this.axiosInstance(config);
      return { data: response, error: null };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { data: null, error: this.handleAxiosError(error) };
      }
      return { data: null, error };
    }
  }

  public async handlerWithoutRetries(config: AxiosRequestConfig): Promise<AxiosHandlerOutcome> {
    try {
      const response = await axios(config);
      return { data: response, error: null };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return { data: null, error: this.handleAxiosError(error) };
      }
      return { data: null, error };
    }
  }

  /** [1] https://thedutchlab.com/blog/using-axios-interceptors-for-refreshing-your-api-token
   *  [2] https://www.npmjs.com/package/axios#interceptors
   */
  private interceptAxiosInstance(
    interceptRequest: InterceptRequest,
    interceptResponse: InterceptResponseError,
  ): AxiosInstance {
    const instance = axios.create();
    // Request interceptor for API calls
    instance.interceptors.request.use(interceptRequest, (error) => {
      // Do something with request error
      Promise.reject(error);
    });

    // Allow to intercept response error
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        const needToRetryRequest = await interceptResponse(error);
        if (needToRetryRequest) {
          originalRequest.retry = true;
          return instance.request(originalRequest);
        }
        return Promise.reject(error);
      },
    );

    return instance;
  }

  private handleAxiosError(error: AxiosError) {
    if (!error.response) {
      // Handle canceled requests from axios interceptors
      if (error.message === CANCEL_REQUEST_MSG) return new CanceledRequestError(error.message);
      // console.error('AxiosError', error.message, ':AND:', error);
      // network error - also !error.status
      return new NetworkRestError(error.message);
    }
    // http status code
    const code = error.response.status;
    // response data
    const response = error.response.data;
    return error.response;
  }
}
