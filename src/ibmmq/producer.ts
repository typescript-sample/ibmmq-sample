import { authentication, cleanup, IBMMQConfig, QueueConfig, TopicConfig } from './core';

export interface StringMap {
  [key: string]: string;
}
function formatErr(err: { message: string; }) {
  return 'MQ call failed in ' + err.message;
}
export class Producer<T> {
  private ghObj: any;
  private ghConn: any;
  private readonly mq: any;
  constructor(
    public conf: IBMMQConfig,
    public logError: (msg: string) => void,
    public logInfo?: (msg: string) => void,
  ) {
    this.mq = require('ibmmq');
    this.put = this.put.bind(this);
    this.produce = this.produce.bind(this);
    this.queue = this.queue.bind(this);
    this.send = this.send.bind(this);
    this.write = this.write.bind(this);
    this.publish = this.publish.bind(this);
  }
  put(data: T): Promise<void> {
    return this.publish(data);
  }
  produce(data: T): Promise<void> {
    return this.publish(data);
  }
  send(data: T): Promise<void> {
    return this.publish(data);
  }
  write(data: T): Promise<void> {
    return this.publish(data);
  }
  publish(data: T): Promise<void> {
    const lg = this.logInfo;
    const lgErr = this.logError;
    return new Promise((resolve, reject) => {
      // Import the MQ package
      const MQC = this.mq.MQC; // Want to refer to this export directly for simplicity
      // The queue manager and topic to be used. These can be overridden on command line.
      // The DEV.BASE.TOPIC object defines a tree starting at dev/
      const qMgr = this.conf.mgr;
      const topicString = this.conf.topic;
      // Define some functions that will be used from the main flow
      const publishMessage = (hObj: any): boolean => {
        let succeed = true;
        const msg = JSON.stringify(data as any);
        const mqmd = new this.mq.MQMD(); // Defaults are fine.
        const pmo = new this.mq.MQPMO();
        // Describe how the Publish (Put) should behave
        // tslint:disable-next-line:no-bitwise
        pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
          MQC.MQPMO_NEW_MSG_ID |
          MQC.MQPMO_NEW_CORREL_ID;
        // Add in the flag that gives a warning if noone is
        // subscribed to this topic.
        // tslint:disable-next-line:no-bitwise
        pmo.Options |= MQC.MQPMO_WARN_IF_NO_SUBS_MATCHED;
        this.mq.Put(hObj, mqmd, pmo, msg, (err: { message: string; }) => {
          if (err) {
            if (lgErr) {
              lgErr(formatErr(err));
              succeed = false;
            }
          } else {
            if (lg) {
              lg('MQPUT successful');
            }
          }
        });
        return succeed;
      };
      // The program really starts here.
      // Connect to the queue manager. If that works, the callback function
      // opens the topic, and then we can put a message.

      if (lg) {
        lg('Sample AMQSPUB.JS start');
      }
      const cno = authentication(this.mq, this.conf);
      this.mq.Connx(qMgr, cno, (err: { message: string; }, hConn: any) => {
        if (err) {
          if (lgErr) {
            lgErr(formatErr(err));
            return reject(formatErr(err));
          }
        } else {
          if (lg) {
            lg(`MQCONN to ${qMgr} successful `, );
          }
          // Define what we want to open, and how we want to open it.
          //
          // For this sample, we use only the ObjectString, though it is possible
          // to use the ObjectName to refer to a topic Object (ie something
          // that shows up in the DISPLAY TOPIC list) and then that
          // object's TopicStr attribute is used as a prefix to the TopicString
          // value supplied here.
          // Remember that the combined TopicString attribute has to match what
          // the subscriber is using.
          const od = new this.mq.MQOD();
          od.ObjectString = topicString;
          od.ObjectType = MQC.MQOT_TOPIC;
          const openOptions = MQC.MQOO_OUTPUT;
          this.mq.Open(hConn, od, openOptions, (err1: { message: string; }, hObj: any) => {
            if (err1) {
              if (lgErr) {
                lgErr(formatErr(err1));
                return reject(formatErr(err1));
              }
              cleanup(this.mq, hConn, hObj, lgErr, lg);
            } else {
              if (lg) {
                lg(`MQOPEN of ${topicString} successful`);
              }
              if (publishMessage(hObj)) {
                return resolve();
              }
            }
          });
        }
      });
    });
  }
  queue(data: T): Promise<void> {
    const lg = this.logInfo;
    const lgErr = this.logError;
    return new Promise((resolve, reject) => {
      const MQC = this.mq.MQC; // Want to refer to this export directly for simplicity
      const cno = authentication(this.mq, this.conf);
      this.mq.ConnxPromise(this.conf.mgr, cno)
        .then((hConn: any) => {
          if (lg) {
            lg(`MQCONN to ${this.conf.mgr} successful `);
          }
          this.ghConn = hConn;
          const od = new this.mq.MQOD();
          od.ObjectName = this.conf.queue;
          od.ObjectType = MQC.MQOT_Q;
          const openOptions = MQC.MQOO_OUTPUT;
          return this.mq.OpenPromise(hConn, od, openOptions);
        }).then((hObj: any) => {
          if (lg) {
            lg(`MQOPEN of ${this.conf.queue} successful`, );
          }
          const msg = JSON.stringify(data as any);
          const mqmd = new this.mq.MQMD(); // Defaults are fine.
          const pmo = new this.mq.MQPMO();
          // tslint:disable-next-line:no-bitwise
          pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
            MQC.MQPMO_NEW_MSG_ID |
            MQC.MQPMO_NEW_CORREL_ID;
          this.ghObj = hObj;
          return this.mq.PutPromise(hObj, mqmd, pmo, msg);
        })
        .then(() => {
          if (lg) {
            lg('Done.');
          }
        })
        .catch((err: { message: string; }) => {
          if (lgErr) {
            lgErr(formatErr(err));
          }
          cleanup(this.mq, this.ghConn, this.ghObj, lgErr, lg);
        });
    });
  }
}
export const Publisher = Producer;
export const Sender = Producer;
export const Writer = Producer;
// tslint:disable-next-line:max-classes-per-file
export class TopicProducer<T> {
  private readonly mq: any;
  constructor(
    public conf: TopicConfig,
    public logError: (msg: string) => void,
    public logInfo?: (msg: string) => void,
  ) {
    this.mq = require('ibmmq');
    this.put = this.put.bind(this);
    this.produce = this.produce.bind(this);
    this.send = this.send.bind(this);
    this.write = this.write.bind(this);
    this.publish = this.publish.bind(this);
  }
  put(topic: string, data: T): Promise<void> {
    return this.publish(topic, data);
  }
  produce(topic: string, data: T): Promise<void> {
    return this.publish(topic, data);
  }
  send(topic: string, data: T): Promise<void> {
    return this.publish(topic, data);
  }
  write(topic: string, data: T): Promise<void> {
    return this.publish(topic, data);
  }
  publish(topic: string, data: T): Promise<void> {
    const lg = this.logInfo;
    const lgErr = this.logError;
    return new Promise((resolve, reject) => {
      // Import the MQ package
      const MQC = this.mq.MQC; // Want to refer to this export directly for simplicity
      // The queue manager and topic to be used. These can be overridden on command line.
      // The DEV.BASE.TOPIC object defines a tree starting at dev/
      const qMgr = this.conf.mgr;
      // Define some functions that will be used from the main flow
      const publishMessage = (hObj: any): boolean => {
        let ok = true;
        const msg = JSON.stringify(data as any);
        const mqmd = new this.mq.MQMD(); // Defaults are fine.
        const pmo = new this.mq.MQPMO();
        // Describe how the Publish (Put) should behave
        // tslint:disable-next-line:no-bitwise
        pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
          MQC.MQPMO_NEW_MSG_ID |
          MQC.MQPMO_NEW_CORREL_ID;
        // Add in the flag that gives a warning if noone is
        // subscribed to this topic.
        // tslint:disable-next-line:no-bitwise
        pmo.Options |= MQC.MQPMO_WARN_IF_NO_SUBS_MATCHED;
        this.mq.Put(hObj, mqmd, pmo, msg, (err: { message: string; }) => {
          if (err) {
            if (lgErr) {
              lgErr(formatErr(err));
              ok = false;
            }
          } else {
            if (lg) {
              lg('MQPUT successful');
            }
          }
        });
        return ok;
      };
      // The program really starts here.
      // Connect to the queue manager. If that works, the callback function
      // opens the topic, and then we can put a message.

      if (lg) {
        lg('Sample AMQSPUB.JS start');
      }
      const cno = authentication(this.mq, this.conf);
      this.mq.Connx(qMgr, cno, (err: { message: string; }, hConn: any) => {
        if (err) {
          if (lgErr) {
            lgErr(formatErr(err));
          }
        } else {
          if (lg) {
            lg(`MQCONN to ${qMgr} successful `, );
          }
          // Define what we want to open, and how we want to open it.
          //
          // For this sample, we use only the ObjectString, though it is possible
          // to use the ObjectName to refer to a topic Object (ie something
          // that shows up in the DISPLAY TOPIC list) and then that
          // object's TopicStr attribute is used as a prefix to the TopicString
          // value supplied here.
          // Remember that the combined TopicString attribute has to match what
          // the subscriber is using.
          const od = new this.mq.MQOD();
          od.ObjectString = topic;
          od.ObjectType = MQC.MQOT_TOPIC;
          const openOptions = MQC.MQOO_OUTPUT;
          this.mq.Open(hConn, od, openOptions, (err1: { message: string; }, hObj: any) => {
            if (err1) {
              if (lgErr) {
                lgErr(formatErr(err1));
                return reject(formatErr(err1));
              }
              cleanup(this.mq, hConn, hObj, lgErr, lg);
            } else {
              if (lg) {
                lg(`MQOPEN of ${topic} successful`);
              }
              if (publishMessage(hObj)) {
                resolve();
              }
            }
          });
        }
      });
    });
  }
}
export const TopicPublisher = TopicProducer;
export const TopicSender = TopicProducer;
export const TopicWriter = TopicProducer;
// tslint:disable-next-line:max-classes-per-file
export class QueueProducer<T> {
  private ghObj: any;
  private ghConn: any;
  private readonly mq: any;
  constructor(
    public conf: QueueConfig,
    public logError: (msg: string) => void,
    public logInfo?: (msg: string) => void,
  ) {
    this.mq = require('ibmmq');
    this.put = this.put.bind(this);
    this.produce = this.produce.bind(this);
    this.send = this.send.bind(this);
    this.write = this.write.bind(this);
    this.publish = this.publish.bind(this);
  }
  put(queue: string, data: T): Promise<void> {
    return this.publish(queue, data);
  }
  produce(queue: string, data: T): Promise<void> {
    return this.publish(queue, data);
  }
  send(queue: string, data: T): Promise<void> {
    return this.publish(queue, data);
  }
  write(queue: string, data: T): Promise<void> {
    return this.publish(queue, data);
  }
  publish(queue: string, data: T): Promise<void> {
    const lg = this.logInfo;
    const lgErr = this.logError;
    return new Promise((resolve, reject) => {
      const MQC = this.mq.MQC; // Want to refer to this export directly for simplicity
      const cno = authentication(this.mq, this.conf);
      this.mq.ConnxPromise(this.conf.mgr, cno)
        .then((hConn: any) => {
          if (lg) {
            lg(`MQCONN to ${this.conf.mgr} successful `);
          }
          this.ghConn = hConn;
          const od = new this.mq.MQOD();
          od.ObjectName = queue;
          od.ObjectType = MQC.MQOT_Q;
          const openOptions = MQC.MQOO_OUTPUT;
          return this.mq.OpenPromise(hConn, od, openOptions);
        }).then((hObj: any) => {
          if (lg) {
            lg(`MQOPEN of ${queue} successful`, );
          }
          const msg = JSON.stringify(data as any);
          const mqmd = new this.mq.MQMD(); // Defaults are fine.
          const pmo = new this.mq.MQPMO();
          // tslint:disable-next-line:no-bitwise
          pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
            MQC.MQPMO_NEW_MSG_ID |
            MQC.MQPMO_NEW_CORREL_ID;
          this.ghObj = hObj;
          return this.mq.PutPromise(hObj, mqmd, pmo, msg);
        })
        .then(() => {
          if (lg) {
            lg('Done.');
            return resolve();
          }
        })
        .catch((err: { message: string; }) => {
          if (lgErr) {
            lgErr(formatErr(err));
            return reject(formatErr(err));
          }
          cleanup(this.mq, this.ghConn, this.ghObj, lgErr, lg);
        });
    });
  }
}
export const QueuePublisher = QueueProducer;
export const QueueSender = QueueProducer;
export const QueueWriter = QueueProducer;
