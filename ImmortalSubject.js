var Rx = require('rx');
function NOOP() {}

function ImmortalSubject(onError) {
    Rx.Subject.apply(this);
}

ImmortalSubject.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: NOOP,
    onError: NOOP
};

module.exports = ImmortalSubject;

