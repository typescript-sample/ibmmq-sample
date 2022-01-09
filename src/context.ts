import { HealthController, LogController } from 'express-ext';
import { Config, JSONLogger, map } from 'logger-core';
import { Db } from 'mongodb';
import { Attributes, MongoChecker, MongoUpserter } from 'mongodb-extension';
import { Consume, createRetry, ErrorHandler, Handle, Handler, NumberMap } from 'mq-one';
import { Validator } from 'xvalidators';
import { Consumer, IBMMQChecker, IBMMQConfig, Producer } from './ibmmq';

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
}
export const user: Attributes = {
  id: {
    length: 40
  },
  username: {
    required: true,
    length: 255
  },
  email: {
    format: 'email',
    required: true,
    length: 120
  },
  phone: {
    format: 'phone',
    required: true,
    length: 14
  },
  dateOfBirth: {
    type: 'datetime',
    column: 'date_of_birth'
  }
};

export interface Conf {
  log: Config;
  retries: NumberMap;
  ibmmq: IBMMQConfig;
}
export interface ApplicationContext {
  health: HealthController;
  log: LogController;
  produce: (data: User) => Promise<void>;
  consume: Consume<User>;
  handle: Handle<User>;
}
export function useContext(db: Db, conf: Conf): ApplicationContext {
  const retries = createRetry(conf.retries);
  const logger = new JSONLogger(conf.log.level, conf.log.map);
  const log = new LogController(logger, map);
  const mongoChecker = new MongoChecker(db);
  const ibmmqChecker = new IBMMQChecker(conf.ibmmq);
  const health = new HealthController([mongoChecker, ibmmqChecker]);
  const consumer = new Consumer<User>(conf.ibmmq, logger.error, logger.info, true);
  const validator = new Validator<User>(user, true);
  const writer = new MongoUpserter(db.collection('users'), 'id');
  const errorHandler = new ErrorHandler(logger.error);
  const handler = new Handler<User, string>(writer.write, validator.validate, retries, errorHandler.error, logger.error, logger.info);

  const producer = new Producer<User>(conf.ibmmq, logger.error, logger.info);
  return { health, log, produce: producer.produce, consume: consumer.subscribe, handle: handler.handle };
}
export function writeUser(msg: User): Promise<number> {
  console.log('Error: ' + JSON.stringify(msg));
  return Promise.resolve(1);
}
