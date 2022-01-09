export interface BaseConfig {
  connection: string;
  service: string;
  mgr: string; // qMgr
  channel: string;
  user: string;
  password: string;
  interval: number; // waitInterval
}
export interface TopicConfig extends BaseConfig {
  topic: string;
}
export interface QueueConfig extends BaseConfig {
  queue: string; // queueName
}
export interface IBMMQConfig extends BaseConfig {
  topic: string;
  queue: string; // queueName
}

function formatErr(err: { message: string; }) {
  return 'MQ call failed in ' + err.message;
}
export function cleanup(mq: any, hConn: any, hObj: any, logErr?: (msg: string) => void, log?: (msg: string) => void): void {
  mq.Close(hObj, 0, (err: { message: string; }) => {
    if (err) {
      if (logErr) {
        logErr(formatErr(err));
      }
    } else {
      if (log) {
        log('MQCLOSE successful');
      }
    }
    mq.Disc(hConn, (err1: { message: string; }) => {
      if (log) {
        if (err1) {
          if (logErr) {
            logErr(formatErr(err1));
          }
        } else {
          if (log) {
            log('MQDISC successful');
          }
        }
      }
    });
  });
}
export function authentication(mq: any, conf: BaseConfig): any {
  const MQC = mq.MQC;
  const cd = new mq.MQCD();
  cd.ConnectionName = conf.connection;
  cd.ChannelName = conf.channel;
  const cno = new mq.MQCNO();
  cno.ClientConn = cd;
  cno.Options = MQC.MQCNO_CLIENT_BINDING; // use MQCNO_CLIENT_BINDING to connect as client
  const csp = new mq.MQCSP();
  csp.UserId = conf.user;
  csp.Password = conf.password;
  cno.SecurityParms = csp;
  return cno;
}

export async function checkIBMQueue(mq: any, conf: IBMMQConfig, log?: (msg: string) => void) {
  if (!log) {
    log = console.log;
  }
  const MQC = mq.MQC; // Want to refer to this export directly for simplicity
  // The queue manager to be used.
  const qMgr = conf.mgr;
  const cno = new mq.MQCNO();
  // Add authentication via the MQCSP structure
  const csp = new mq.MQCSP();
  csp.UserId = conf.user;
  csp.Password = conf.password;
  cno.SecurityParms = csp;
  // tslint:disable-next-line:no-bitwise
  cno.Options |= MQC.MQCNO_CLIENT_BINDING;
  const cd = new mq.MQCD();
  cd.ConnectionName = conf.connection;
  cd.ChannelName = conf.channel;
  // Make the MQCNO refer to the MQCD
  cno.ClientConn = cd;
  // MQ V9.1.2 allows setting of the application name explicitly
  if (MQC.MQCNO_CURRENT_VERSION >= 7) {
    cno.ApplName = conf.service;
  }
  await mq.Connx(qMgr, cno, (err: { message: string; }, conn: any) => {
    if (err) {
      if (log) {
        log(formatErr(err));
      }
    } else {
      mq.Disc(conn, (err1: { message: string; }) => {
        if (err1) {
          if (log) {
            log(formatErr(err1));
          }
        } else {
          if (log) {
            log('MQDISC successful');
          }
        }
      });
    }
  });
}
