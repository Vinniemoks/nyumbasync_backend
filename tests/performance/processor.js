// Artillery processor for custom functions

module.exports = {
  // Generate random string
  randomString: function(context, events, done) {
    context.vars.randomString = Math.random().toString(36).substring(7);
    return done();
  },

  // Generate random number
  randomNumber: function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Generate Kenyan phone number
  generateKenyanPhone: function(context, events, done) {
    const prefix = '254';
    const number = Math.floor(Math.random() * 900000000) + 100000000;
    context.vars.phone = prefix + number;
    return done();
  },

  // Log response time
  logResponseTime: function(requestParams, response, context, ee, next) {
    if (response.timings) {
      console.log(`Response time: ${response.timings.phases.total}ms`);
    }
    return next();
  },

  // Custom metrics
  beforeRequest: function(requestParams, context, ee, next) {
    requestParams.startTime = Date.now();
    return next();
  },

  afterResponse: function(requestParams, response, context, ee, next) {
    const duration = Date.now() - requestParams.startTime;
    ee.emit('customStat', {
      stat: 'response_time',
      value: duration
    });
    return next();
  }
};
