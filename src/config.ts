export const config = {
  port: 8088,
  sub_port: 8089,
  log: {
    level: 'info',
    map: {
      time: '@timestamp',
      msg: 'message'
    }
  },
  mongo: {
    uri: 'mongodb://root:12345678@localhost:27017/?authSource=admin&readPreference=primary&appname=MongoDB%20Compass&directConnection=true&ssl=false',
    db: 'masterdata'
  },
  retries: {
    1: 10000,
    2: 15000,
    3: 25000,
  },
  ibmmq: {
    interval: 10000,
    service: 'ibmmq',
    connection: 'ibm_mq(1414)',
    mgr: 'QM1',
    queue: 'DEV.QUEUE.1',
    channel: 'DEV.APP.SVRCONN',
    user: 'app',
    password: 'passw0rd',
    topic: 'dev/'
  },
  retry: {
    name: 'retry',
    limit: 3
  }
};

export const env = {
  sit: {
    log: {
      level: 'error'
    },
    mongo: {
      database: 'masterdata_sit',
    }
  },
  prd: {
    log: {
      level: 'error'
    }
  }
};
