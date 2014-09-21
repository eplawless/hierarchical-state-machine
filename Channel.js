var Rx = require('rx');

function Channel() {
    Rx.Subject.apply(this, arguments);
}

Channel.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: function() {},
    onError: function() {}
};

module.exports = Channel;

