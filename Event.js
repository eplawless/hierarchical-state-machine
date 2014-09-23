var Rx = require('rx');
function NOOP() {}

function Event() {
    Rx.Subject.apply(this, arguments);
}

Event.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: NOOP,
    onError: NOOP
};

module.exports = Event;

