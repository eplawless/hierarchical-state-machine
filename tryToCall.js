
function tryToCall(method, scope) {
    if (typeof method === 'function') {
        var args = Array.prototype.slice.call(arguments, 2);
        method.apply(scope, args);
    }
}

module.exports = tryToCall;

