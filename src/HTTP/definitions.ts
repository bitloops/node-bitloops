import { AxiosResponse } from 'axios';

// export type AxiosHandlerOutcome = [AxiosResponse, null] | [AxiosResponse | null, AxiosError] | [null, unknown];
export type AxiosHandlerOutcome = AxiosDataResponse | AxiosErrorResponse | AxiosUnexpectedResponse;

type AxiosDataResponse = {
  data: AxiosResponse;
  error: null;
};

type AxiosErrorResponse = {
  data: null;
  error: AxiosResponse;
};

type AxiosUnexpectedResponse = {
  data: null;
  error: unknown;
};
