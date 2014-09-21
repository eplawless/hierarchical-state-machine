var Rx = require('rx');

function Event() {
    Rx.Subject.apply(this, arguments);
}

Event.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: function() {},
    onError: function() {}
};

module.exports = Event;

