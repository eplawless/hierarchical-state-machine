function Event(data) {
    this.data = data;
}

Event.prototype = {
    __proto__: Event.prototype,
    isHandled: true,
    propagate: function() {
        this.isHandled = false;
    }
}

module.exports = Event;
