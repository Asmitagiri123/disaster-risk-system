// In-process bus for real-time events. Services emit; the SSE route subscribes.
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(100); // many SSE clients subscribe at once

module.exports = bus;
