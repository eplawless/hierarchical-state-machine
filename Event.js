var Rx = require('rx');
function NOOP() {}

function Event(onError) {
    Rx.Subject.apply(this);
}

Event.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: NOOP,
    onError: NOOP
};

module.exports = Event;

