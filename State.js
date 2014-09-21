var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var Channel = require('./Channel');
var NOOP = function() {};

function State(props, behavior, parent) {
    this._props = props;
    this._entered = false;
    this._behavior = behavior;
    this.parent = parent;
}

State.prototype = {

    get enters() {
        if (!this._enters) { this._enters = new Channel; }
        return this._enters;
    },

    get exits() {
        if (!this._exits) { this._exits = new Channel; }
        return this._exits;
    },

    update: function(behavior) {
        this._behavior = behavior;
    },

    _listenForEventTransitions: function() {
        var parentState = this.parent;
        var transitionOnEvents = tryToGet(this, '_props', 'transitionOnEvents');
        for (var eventName in transitionOnEvents) {
            var stateName = transitionOnEvents[eventName];
            var observer = {
                onNext: function(stateName) {
                    tryToCall(tryToGet(parentState, 'transition'), parentState, stateName);
                }.bind(null, stateName),
                onError: NOOP,
                onCompleted: function() {}
            };
            this.getChannel(eventName)
                .take(1)
                .takeUntil(this.exits)
                .subscribe(observer);
        }
    },

    enter: function() {
        if (!this.canBeEntered())
            return false;
        this._entered = true;
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, this.parent);
        this._listenForEventTransitions();
        return true;
    },
    exit: function() {
        if (!this.canBeExited())
            return false;
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterExit'), this, this, this.parent);
        this._exits && this._exits.onNext();
        this._entered = false;
        return true;
    },
    canBeEntered: function() {
        if (this._entered)
            return false;
        var canEnter = tryToGet(this, '_props', 'canEnter');
        if (canEnter && !tryToCall(canEnter, this, this))
            return false;
        return true;
    },
    canBeExited: function() {
        if (!this._entered)
            return false;
        var canExit = tryToGet(this, '_props', 'canExit');
        if (canExit && !tryToCall(canExit, this, this))
            return false;
        return true;
    },

    getParentChannel: function(name, scope) {
        var parent = this.parent;
        return tryToCall(tryToGet(parent, 'getChannel'), parent, name, scope);
    },

    getChannel: function(name, scope) {
        scope = scope || this;
        return this.getParentChannel(name, scope);
    },
};

module.exports = State;
