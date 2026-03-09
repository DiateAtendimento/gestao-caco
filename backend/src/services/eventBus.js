const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

function publishDemandasUpdate(payload = {}) {
  bus.emit('demandas:update', {
    at: Date.now(),
    ...payload
  });
}

function subscribe(eventName, handler) {
  bus.on(eventName, handler);
  return () => bus.off(eventName, handler);
}

module.exports = {
  publishDemandasUpdate,
  subscribe
};
