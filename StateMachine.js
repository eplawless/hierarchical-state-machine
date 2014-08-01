var Rx = require('rx');
var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var NOOP = function() {};

function Channel() {
    Rx.Subject.apply(this, arguments);
    this._deferredValues = [];
}

Channel.prototype = {
    __proto__: Rx.Subject.prototype,
    onCompleted: function() {},
    onError: function() {},
    defer: function(value) {
        this._deferredValues.push(value);
    },
    subscribe: function(onNext, onError, onCompleted) {
        if (this._deferredValues.length) {
            var deferredValues = this._deferredValues;
            Rx.Observable.fromArray(deferredValues)
                .doAction(function() { return deferredValues.unshift(); })
                .subscribe(onNext, onError, onCompleted);
        }
        var result = this.__proto__.__proto__.subscribe.apply(this, arguments);
        return result;
    }
};

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

    _listenForDeferredEvents: function() {
        var self = this;
        var listOfDeferredEvents = tryToGet(this, '_props', 'deferEvents');
        if (Array.isArray(listOfDeferredEvents)) {
            listOfDeferredEvents.forEach(function(event) {
                var eventChannel = self.getChannel(event);
                eventChannel
                    .takeUntil(self.exits)
                    .subscribe(function(value) {
                        eventChannel.defer(value);
                    });
            });
        }
    },

    enter: function() {
        if (!this.canBeEntered())
            return false;
        this.entered = true;
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, this.parent);
        this._listenForEventTransitions();
        this._listenForDeferredEvents();
        return true;
    },
    exit: function() {
        if (!this.canBeExited())
            return false;
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterExit'), this, this, this.parent);
        this._exits && this._exits.onNext();
        this.entered = false;
        return true;
    },
    canBeEntered: function() {
        if (this.entered)
            return false;
        var canEnter = tryToGet(this, '_props', 'canEnter');
        if (canEnter && !tryToCall(canEnter, this, this))
            return false;
        return true;
    },
    canBeExited: function() {
        if (!this.entered)
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

function StateMachine(props, behavior, parent) {
    this.exit = this.exit.bind(this);
    this.enter = this.enter.bind(this);
    this.transition = this.transition.bind(this);
    this._props = (props && typeof props === 'object') ? props : {};
    this._props.states = (this._props.states && typeof this._props.states === 'object') ? this._props.states : {};
    if (!('startState' in this._props)) {
        throw new Error('StateMachine requires startState property');
    }
    if (!(this._props.startState in this._props.states)) {
        throw new Error('StateMachine\'s initial state "' + this._props.startState + '" doesn\'t exist');
    }
    this.parent = parent;
    ('allowSelfTransitions' in this._props) || (this._props.allowSelfTransitions = false);
    ('requireExplicitTransitions' in this._props) || (this._props.requireExplicitTransitions = false);
    ('states' in this._props) || (this._props.states = {});
    this._behavior = behavior || {};
    this._entered = false;
    this.currentStateName = null;
    this._nestedStateMachineFactories = this._createNestedStateMachineFactories(this._props.states);
    this._nestedStates = {};
    this._channels = this._createChannels(this._props);
    this._isTransitioning = false;
    this._queuedEnters = [];
    this._hasQueuedExit = false;
}

StateMachine.prototype = {

    get enters() {
        if (!this._enters) { this._enters = new Channel; }
        return this._enters;
    },
    get exits() {
        if (!this._exits) { this._exits = new Channel; }
        return this._exits;
    },

    _createChannels: function(props) {
        var result = {};
        var listOfChannels = props.channels || [];
        if (Array.isArray(listOfChannels)) {
            listOfChannels.forEach(function(name) {
                result[name] = new Channel;
            })
        }
        return result;
    },

    getParentChannel: function(name, scope) {
        var parent = this.parent;
        return tryToCall(tryToGet(parent, 'getChannel'), parent, name, scope);
    },

    getChannel: function(name, scope) {
        scope = scope || this;
        return this._channels[name] || this.getParentChannel(name, scope);
    },

    _createNestedStateMachineFactories: function(states) {
        var result = {};
        var StateMachineFactory = require('./StateMachineFactory')
        for (var stateName in states) {
            var state = states[stateName];
            var subStates = tryToGet(state, 'states');
            if (subStates && typeof subStates === 'object') {
                result[stateName] = new StateMachineFactory(state);
            }
        }
        return result;
    },

    _listenForEventTransitions: function() {
        var parentState = this.parent;
        var transitionOnEvents = tryToGet(this, '_props', 'transitionOnEvents');
        for (var event in transitionOnEvents) {
            this.getChannel(event)
                .take(1)
                .takeUntil(this.exits)
                .subscribe(function(stateName) {
                    tryToCall(tryToGet(parentState, 'transition'), parentState, stateName);
                }.bind(null, transitionOnEvents[event]));
        }
    },

    _listenForDeferredEvents: function() {
        var listOfDeferredEvents = tryToGet(this, '_props', 'deferEvents');
        if (Array.isArray(listOfDeferredEvents)) {
            for (var idx = 0; idx < listOfDeferredEvents.length; ++idx) {
                var event = listOfDeferredEvents[idx];
                var eventChannel = this.getChannel(event);
                eventChannel
                    .takeUntil(this.exits)
                    .subscribe(function(value) {
                        eventChannel.defer(value);
                    });
            }
        }
    },

    enter: function() {
        if (this._entered) {
            return;
        }
        this._entered = true; // we set this flag here so we can transition more on the way in
        this._enters && this._enters.onNext();
        this._isTransitioning = true;
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, this.parent);
        this._isTransitioning = false;
        this._listenForEventTransitions();
        this._listenForDeferredEvents();
        if (this._queuedEnters.length) { // allow before/on/afterEnter to transition us first
            this.transition();
        } else {
            this.transition(this._props.startState);
        }
    },

    _getOrCreateNestedState: function(stateName, stateProps, stateBehavior) {
        var nestedState = this._nestedStates[stateName];
        if (nestedState) {
            return nestedState;
        }
        var nestedStateMachineFactory = this._nestedStateMachineFactories[stateName];
        nestedState = nestedStateMachineFactory
            ? nestedStateMachineFactory.create(stateBehavior, this)
            : new State(stateProps, stateBehavior, this);
        this._nestedStates[stateName] = nestedState;
        return nestedState;
    },

    _enterNestedState: function(stateName, stateProps, stateBehavior) {
        this.currentStateName = stateName;
        var nestedState = this._getOrCreateNestedState(stateName, stateProps, stateBehavior);
        nestedState.enter();
    },

    exit: function() {
        if (!this._entered) {
            return;
        }
        if (this._isTransitioning) {
            this._hasQueuedExit = true;
            return;
        }
        this._entered = false; // we set this flag here so we can't transition on the way out
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, '_props', 'states', this.currentStateName),
            tryToGet(this, '_behavior', 'states', this.currentStateName)
        );
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterExit'), this, this, this.parent);
        this._exits && this._exits.onNext();
    },

    _exitNestedState: function(stateName, stateProps, stateBehavior) {
        var nestedState = this._nestedStates[stateName];
        if (nestedState) {
            nestedState.exit();
            delete this._nestedStates[stateName];
        }
        this.currentStateName = null;
        return nestedState;
    },

    _runTransitionHandlers: function(lastStateName, nextStateName, lastNestedState, nextNestedState) {
        var lastStateProps = tryToGet(this._props, 'states', lastStateName);
        var lastStateBehavior = tryToGet(this._behavior, 'states', lastStateName);
        var beforeTransition = tryToGet(lastStateBehavior, 'beforeTransitionTo', nextStateName);
        var onTransition = tryToGet(lastStateProps, 'onTransitionTo', nextStateName);
        var afterTransition = tryToGet(lastStateBehavior, 'afterTransitionTo', nextStateName);
        tryToCall(beforeTransition, lastNestedState, lastNestedState, nextNestedState);
        tryToCall(onTransition, lastNestedState, lastNestedState, nextNestedState);
        tryToCall(afterTransition, lastNestedState, lastNestedState, nextNestedState);
    },

    _isTransitionAllowed: function(lastStateName, nextStateName, lastState, nextState) {
        if (!nextState) { return false; }
        var isSelfTransition = lastStateName === nextStateName;
        var allowSelfTransitions = !!this._props.allowSelfTransitions;
        var requireExplicitTransitions = !!this._props.requireExplicitTransitions;

        var allowTransitionsTo = tryToGet(this._props, 'states', lastStateName, 'allowTransitionsTo');
        var allowTransitionsFromLastToNext = false;
        if (Array.isArray(allowTransitionsTo)) {
            allowTransitionsFromLastToNext = allowTransitionsTo.indexOf(nextStateName) > -1;
        } else {
            allowTransitionsFromLastToNext = !!tryToGet(allowTransitionsTo, nextStateName);
        }

        if (isSelfTransition && !allowSelfTransitions && !allowTransitionsFromLastToNext) {
            return false;
        }

        if (requireExplicitTransitions && lastState && !allowTransitionsFromLastToNext) {
            return false;
        }

        var canExit = tryToGet(lastState, 'canExit');
        var canTransition = tryToGet(lastState, 'canTransitionTo', nextStateName);
        var canEnter = tryToGet(nextState, 'canEnter');

        var lastNestedState = this._nestedStates[lastStateName];
        if (canExit && !canExit.call(lastNestedState, lastNestedState, tryToGet(lastNestedState, 'parent')) ||
            canTransition && !canTransition.call(lastNestedState, lastNestedState, tryToGet(lastNestedState, 'parent')) ||
            canEnter && !canEnter.call(lastNestedState, lastNestedState, tryToGet(lastNestedState, 'parent')))
        {
            return false;
        }

        return true;
    },

    transition: function(stateName) {
        if (!this._entered) {
            return;
        }
        var props = this._props;
        var behavior = this._behavior;
        if (this._isTransitioning && stateName) {
            this._queuedEnters.push(stateName);
            return;
        }

        this._isTransitioning = true;

        if (stateName) {
            this._queuedEnters.push(stateName);
        }
        while (this._queuedEnters.length) {
            var lastStateName = this.currentStateName;
            var nextStateName = this._queuedEnters.shift();
            var lastState = props.states[lastStateName];
            var nextState = props.states[nextStateName];
            if (!this._isTransitionAllowed(lastStateName, nextStateName, lastState, nextState)) {
                continue;
            }

            var lastNestedState = this._exitNestedState(
                lastStateName,
                lastState,
                tryToGet(behavior, 'states', lastStateName)
            );

            var nextStateBehavior = tryToGet(behavior, 'states', nextStateName);
            var nextNestedState = this._getOrCreateNestedState(nextStateName, nextState, nextStateBehavior);

            this._runTransitionHandlers(lastStateName, nextStateName, lastNestedState, nextNestedState);

            this._enterNestedState(
                nextStateName,
                nextState,
                nextStateBehavior
            );
        }

        this._isTransitioning = false;
        if (this._hasQueuedExit) {
            this._hasQueuedExit = false;
            this.exit();
        }
    }
};

module.exports = StateMachine;
