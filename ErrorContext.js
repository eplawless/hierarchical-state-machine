function ErrorContext(error) {
    this.error = error;
}

ErrorContext.prototype = {
    __proto__: ErrorContext.prototype,
    isHandled: false,
    stopPropagation: function() { this.isHandled = true; }
};

module.exports = ErrorContext;
