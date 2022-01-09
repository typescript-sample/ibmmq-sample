import { checkIBMQueue, IBMMQConfig } from './core';

export interface AnyMap {
  [key: string]: any;
}
export class IBMMQChecker {
  mq: any;
  config: IBMMQConfig;
  timeout: number;
  service: string;
  constructor(public conf: IBMMQConfig, timeout?: number) {
    this.mq = require('ibmmq');
    this.config = conf;
    this.service = conf.service && conf.service.length > 0 ? conf.service : 'ibmmq';
    this.timeout = (timeout ? timeout : 4200);
    this.check = this.check.bind(this);
    this.name = this.name.bind(this);
    this.build = this.build.bind(this);
  }
  check(): Promise<AnyMap> {
    const obj = {} as AnyMap;
    const promise = new Promise<any>(async (resolve, reject) => {
      try {
        await checkIBMQueue(this.mq, this.config);
        resolve(obj);
      } catch (err) {
        reject(`IBM MQ is down`);
      }
    });
    if (this.timeout > 0) {
      return promiseTimeOut(this.timeout, promise);
    } else {
      return promise;
    }
  }
  name(): string {
    return this.service;
  }
  build(data: AnyMap, err: any): AnyMap {
    if (err) {
      if (!data) {
        data = {} as AnyMap;
      }
      data['error'] = err;
    }
    return data;
  }
}
function promiseTimeOut(timeoutInMilliseconds: number, promise: Promise<any>): Promise<any> {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(`Timed out in: ${timeoutInMilliseconds} milliseconds!`);
      }, timeoutInMilliseconds);
    })
  ]);
}
