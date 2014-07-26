
function tryToGet() {
    var obj = arguments[0];
    for (var idx = 1; idx < arguments.length; ++idx) {
        obj = obj ? obj[arguments[idx]] : undefined;
    }
    return obj;
}

module.exports = tryToGet;

