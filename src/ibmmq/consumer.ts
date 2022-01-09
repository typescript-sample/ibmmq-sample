import { authentication, cleanup, IBMMQConfig } from './core';
import { StringMap } from './producer';

export interface Message<T> {
  id?: string;
  data: T;
}
function formatErr(err: { message: string; }) {
  if (err) {
    return 'MQ call failed at ' + err.message;
  } else {
    return 'MQ call successful';
  }
}
 // When we're done, close queues and connections
 export const cleanupObjSubscription = (mq: any, hObjSubscription: any, lgErr?: (msg: string) => void, lg?: (msg: string) => void) => {
  // Demonstrate two ways of closing queues - first using an exception, then
  // the version with callback.
  try {
    mq.CloseSync(hObjSubscription, 0);
    if (lg) {
      lg('MQCLOSE (Subscription) successful');
    }
  } catch (err) {
    if (lgErr) {
      lgErr('MQCLOSE (Subscription) ended with reason ' + err);
    }
  }
};
/*
* Format any error messages
*/
export const hexToBytes = (hex: string): number[] => {
 const bytes = [];
 for (let c = 0; c < hex.length; c += 2) {
   bytes.push(parseInt(hex.substring(c, 2), 16));
 }
 return bytes;
};
export function bytesToString(array: number[]): string {
  return String.fromCharCode.apply(String, array);
}
export type Hanlde<T> = (data: T, attributes?: StringMap, raw?: Message<T>) => Promise<number>;
export class Consumer<T> {
  private readonly mq: any;
  private interval: any;
  private subInterval: any;
  private readonly mqmd: any;
  private readonly gmo: any;
  private MQC: any;
  private stringdecoderLib: any;

  constructor(
    public conf: IBMMQConfig,
    public logError: (msg: string) => void,
    public logInfo?: (msg: string) => void,
    public json?: boolean) {
    this.mq = require('ibmmq');
    this.stringdecoderLib = require('string_decoder');
    this.mqmd = new this.mq.MQMD();
    this.gmo = new this.mq.MQGMO();
    this.gmo.WaitInterval = this.conf.interval;
    this.MQC = this.mq.MQC;
    /* tslint:disable:no-bitwise */
    this.gmo.Options = this.MQC.MQGMO_NO_SYNCPOINT |
      this.MQC.MQGMO_WAIT |
      this.MQC.MQGMO_CONVERT |
      this.MQC.MQGMO_FAIL_IF_QUIESCING;
    this.gmo.MatchOptions = this.MQC.MQMO_NONE;
    this.get = this.get.bind(this);
    this.receive = this.receive.bind(this);
    this.read = this.read.bind(this);
    this.consume = this.consume.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.queue = this.queue.bind(this);
  }
  get(handle: Hanlde<T>): void {
    this.subscribe(handle);
  }
  receive(handle: Hanlde<T>) {
    return this.subscribe(handle);
  }
  read(handle: Hanlde<T>) {
    return this.subscribe(handle);
  }
  consume(handle: Hanlde<T>): void {
    this.subscribe(handle);
  }
  subscribe(handle: Hanlde<T>): void {
    // Import any other packages needed
    const StringDecoder = this.stringdecoderLib.StringDecoder;
    const decoder = new StringDecoder('utf8');
    // The queue manager and queue to be used
    const qMgr = this.conf.mgr;
    const topicString = this.conf.topic;
    // Global variables
    // Define some functions that will be used from the main flow
    // This function retrieves messages from the queue without waiting using
    // the synchronous method for simplicity. See amqsgeta for how to use the
    // async method.
    const lg = this.logInfo;
    const lgErr = this.logError;
    const getMessage = (hObj: any) => {
      if (lg) {
        lg('Retrieving message.');
      }
      /* tslint:enable:no-bitwise */
      this.mq.Get(hObj, this.mqmd, this.gmo, getCBSub);
    };

    const getCBSub = async (err: { mqrc?: any; message?: string; }, hObj: any, gmo: any, md: { Format: string; }, buf: string) => {
      // If there is an error, prepare to exit by setting the ok flag to false.
      if (err) {
        if (err.mqrc === this.MQC.MQRC_NO_MSG_AVAILABLE) {
          if (lg) {
            lg('No available messages.');
          }
        } else {
          if (lgErr) {
            lgErr(formatErr(err.mqrc));
          }
        }
        // ok = false;
        // We don't need any more messages delivered, so cause the
        // callback to be deleted after this one has completed.
        this.mq.GetDone(hObj);
      } else {
        const data = this.json ? decoder.write(buf) : buf;
        const msg: Message<any> = {data: data as any};
        await handle(data, undefined, msg).then(() => {
          if (lg) {
            lg('Update done.');
          }
        }).catch((err2: any) => {
          if (lgErr) {
            lgErr(formatErr(err2));
          }
        });
      }
    };

    // The program really starts here.
    // Connect to the queue manager. If that works, the callback function
    // opens the topic, and then we can start to retrieve messages.
    const cno = authentication(this.mq, this.conf);
    // Do the connect, including a callback function
    this.mq.Connx(qMgr, cno, (err: any, hConn: any) => {
      if (err) {
        if (lgErr) {
          lgErr('MQCONN ended with reason code ' + err.mqrc);
        }
      } else {
        if (lg) {
          lg(`MQCONN to ${qMgr} successful `);
        }
        // Define what we want to open, and how we want to open it.
        const sd = new this.mq.MQSD();
        sd.ObjectString = topicString;
        /* tslint:disable:no-bitwise */
        sd.Options = this.MQC.MQSO_CREATE
          | this.MQC.MQSO_NON_DURABLE
          | this.MQC.MQSO_FAIL_IF_QUIESCING
          | this.MQC.MQSO_MANAGED;
        /* tslint:enable:no-bitwise */
        this.mq.Sub(hConn, null, sd, (err1: any, hObjPubQ: any, hObjSubscription: any) => {
          if (err) {
            if (lgErr) {
              lgErr('MQSUB ended with reason ' + err1.mqrc);
            }
            clearInterval(this.subInterval);
            cleanupObjSubscription(this.mq, hObjSubscription, lgErr, lg);
          } else {
            if (lg) {
              lg(`MQSUB to topic ${topicString} successful`);
            }
            // And loop getting messages until done. This will block the main thread (should be another service or increase wait interval time)
            this.subInterval = setInterval(() => getMessage(hObjPubQ), this.conf.interval);
          }
        });
      }
    });
  }
  queue(handle: (data: T, attributes?: StringMap, raw?: Message<T>) => Promise<number>): void {
    const lg = this.logInfo;
    const lgErr = this.logError;
    // Import the MQ package
    const MQC = this.mq.MQC; // Want to refer to this export directly for simplicity
    // Import any other packages needed
    const StringDecoder = this.stringdecoderLib.StringDecoder;
    const decoder = new StringDecoder('utf8');
    // The default queue manager and queue to be used
    const qMgr = this.conf.mgr;
    const qName = this.conf.queue;
    const msgId: string | null = null;
    // Some global variables
    let connectionHandle: any;
    let queueHandle: any;
    /*
     * Define which messages we want to get, and how.
     */
    const getMessages = () => {
      const md = new this.mq.MQMD();
      const gmo = new this.mq.MQGMO();
      // tslint:disable-next-line:no-bitwise
      gmo.Options = MQC.MQGMO_NO_SYNCPOINT |
        MQC.MQGMO_WAIT |
        MQC.MQGMO_CONVERT |
        MQC.MQGMO_FAIL_IF_QUIESCING;
      gmo.MatchOptions = MQC.MQMO_NONE;
      // gmo.WaitInterval = this.conf.wait_interval * 1000; // 3 seconds

      if (msgId != null) {
        if (lg) {
          lg('Setting Match Option for MsgId');
        }
        gmo.MatchOptions = MQC.MQMO_MATCH_MSG_ID;
        md.MsgId = hexToBytes(msgId);
      }
      // Set up the callback handler to be invoked when there
      // are any incoming messages. As this is a sample, I'm going
      // to tune down the poll interval from default 10 seconds to 0.5s.
      // this.mq.setTuningParameters({getLoopPollTimeMs: 10000});
      this.mq.Get(queueHandle, md, gmo, getCB);
    };
    /*
     * This function is the async callback. Parameters
     * include the message descriptor and the buffer containing
     * the message data.
     */
    const getCB = async (err: { mqrc?: any; message?: string; }, hObj: any, gmo: any, md: { Format: string; }, buf: string) => {
      // If there is an error, prepare to exit by setting the ok flag to false.
      if (err) {
        if (err.mqrc === MQC.MQRC_NO_MSG_AVAILABLE) {
          if (lg) {
            lg('No more messages available.');
          }
        } else {
          if (lgErr) {
            lgErr(formatErr(err.mqrc));
          }
        }
        // ok = false;
        // We don't need any more messages delivered, so cause the
        // callback to be deleted after this one has completed.
        this.mq.GetDone(hObj);
      } else {
        const data = this.json ? decoder.write(buf) : buf;
        const msg: Message<any> = {data};
        await handle(data, undefined, msg).then(() => {
          if (lg) {
            lg('Insert done');
          }
        }).catch((err2: any) => {
          if (lgErr) {
            lgErr(err2);
          }
        });
      }
    };
    /*
     * When we're done, close any queues and connections.
     */
    /**************************************************************
     * The program really starts here.
     * Connect to the queue manager. If that works, the callback function
     * opens the queue, and then we can start to retrieve messages.
     */
    // Connect to the queue manager, including a callback function for
    // when it completes.
    const cno = authentication(this.mq, this.conf);
    const od = new this.mq.MQOD();
    od.ObjectName = qName;
    od.ObjectType = MQC.MQOT_Q;
    const openOptions = MQC.MQOO_INPUT_AS_Q_DEF;
    this.mq.Connx(qMgr, cno, (err: { message: string; }, hConn: any) => {
      if (err) {
        if (lgErr) {
          lgErr(formatErr(err));
        }
      } else {
        if (lg) {
          lg(`MQCONN to ${qMgr} successful`);
        }
        connectionHandle = hConn;
        // Define what we want to open, and how we want to open it.
        this.mq.Open(hConn, od, openOptions, (err1: { message: string; }, hObj: any) => {
          queueHandle = hObj;
          if (err1) {
            if (lgErr) {
              lgErr(formatErr(err1));
            }
            cleanup(this.mq, connectionHandle, queueHandle, lgErr, lg);
            clearTimeout(this.interval);
          } else {
            if (lg) {
              lg(`MQOPEN of ${qName} successful`);
            }
            // And now we can ask for the messages to be delivered.
            this.interval = setInterval(getMessages, this.conf.interval);
          }
        });
      }
    });
  }
}
export const Subscriber = Consumer;
export const Reader = Consumer;
export const Receiver = Consumer;
