var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var Event = require('./Event');
var State = require('./State');
var UNIT = Object.freeze({});
function NOOP() {}

/**
 * A hierarchical state machine (or state chart).
 *
 * @param {Object}         props             The core functionality of this state machine.
 * @param {String}         props.start       The name of this state machine's initial state.
 * @param {Array|Object}   props.states      A list (or map) of state names (or configurations).
 * @param {Array}          [props.events]    A list of the names of event streams to create.
 *
 * @param {Array}          [props.transitions]            A list of transition description objects;
 * @param {String}         [props.transitions[0].event]   The name of the event which triggers this transition.
 * @param {String}         [props.transitions[0].from]    The name of the state we're transitioning from.
 * @param {String}         [props.transitions[0].to]      The name of the state we're transitioning to.
 *
 * @param {Boolean}        [props.allowSelfTransitions=false]   Whether to allow self-transitions.
 *
 * @param {Function}       [props.canEnter]   If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function}       [props.canExit]    If canExit returns falsy we cancel an attempt to exit.
 * @param {Function}       [props.onEnter]    Called when this state machine is entered.
 * @param {Function}       [props.onExit]     Called when this state machine is exited.
 *
 * @param {Object}         [behavior]     Provides additional hooks and functionality.
 *
 * @param {StateMachine}   [parent]     This state machine's parent state machine.
 */
function StateMachine(props, behavior, parent) {

    if (!props || typeof props !== 'object') {
        throw new Error('StateMachine constructor requires properties object');
    }

    this._props = props;
    this.setBehavior(behavior);
    this.parent = parent;

    this._activeStates = {};
    this._queuedTransitions = [];

    this._props.states = this._createStatesObject(this._props.states);
    this._props.allowSelfTransitions = !!this._props.allowSelfTransitions;

    if (typeof this._props.start !== 'string')
        throw new Error('StateMachine requires properties.start to be a string');
    if (!this._props.states[this._props.start])
        throw new Error('StateMachine\'s initial state "' + this._props.start + '" doesn\'t exist');

    this._nestedStateMachineFactories = this._createNestedStateMachineFactories(this._props.states);
    this._events = this._createEvents(this._props.events);
    this._privateEvents = this._createEvents(this._props.privateEvents);

}

StateMachine.prototype = {

    __proto__: StateMachine.prototype, // for .constructor support

    _props: null,
    _behavior: null,
    _events: null,
    _privateEvents: null,
    _entered: false,
    _hasQueuedExit: false,
    _queuedExitData: undefined,
    _queuedTransitions: null,
    _isTransitioning: false,
    _enterObservablesByState: null,
    _canAccessPrivateEvents: false,

    currentStateName: null,

    _createStatesObject: function(states) {
        if (!states || typeof states !== 'object') {
            throw new Error('StateMachine requires properties.states object');
        }
        if (!Array.isArray(states)) {
            return states;
        }

        var result = {};
        for (var idx = 0; idx < states.length; ++idx) {
            var state = states[idx];
            if (state && typeof state.name === 'string') {
                result[state.name] = state;
            } else {
                result[state] = {};
            }
        }
        return result;
    },

    setBehavior: function(behavior) {
        if (!behavior) {
            this._behavior = UNIT;
        } else if (typeof behavior === 'object') {
            this._behavior = behavior;
        } else {
            throw new Error('StateMachine requires behavior object');
        }
    },

    _createEvents: function(listOfEvents) {
        var result = {};
        if (Array.isArray(listOfEvents)) {
            for (var idx = 0; idx < listOfEvents.length; ++idx) {
                result[listOfEvents[idx]] = new Event;
            }
        }
        return result;
    },

    get enters() {
        if (!this._enters) { this._enters = new Event; }
        return this._enters;
    },

    get exits() {
        if (!this._exits) { this._exits = new Event; }
        return this._exits;
    },

    get transitions() {
        if (!this._transitions) { this._transitions = new Event; }
        return this._transitions;
    },

    getParentEvent: function(name) {
        var parent = this.parent;
        var getEvent = parent && parent.getEvent;
        return getEvent && parent.getEvent(name, true);
    },

    /**
     * Tries to get the named event stream and optionally onNext data into it.
     *
     * @param {String} name  The name of the event stream to get.
     * @param {?} [data]  Optional data to pass into the event.
     * @return {Boolean}  Whether the event was fired.
     */
    fireEvent: function(name, data) {
        var event = this.getEvent(name);
        event && event.onNext(data);
        return !!event;
    },

    getEvent: function(name, canAccessPrivateEvents) {
        canAccessPrivateEvents = canAccessPrivateEvents || this._canAccessPrivateEvents;
        return this._events[name] ||
            (canAccessPrivateEvents && this._privateEvents[name]) ||
            this.getParentEvent(name);
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

    _getValidEventsForErrorMessage: function() {
        var events = this._props.events || [];
        var parent = this.parent;
        if (parent && parent._getValidEventsForErrorMessage) {
            return events.concat(parent._getValidEventsForErrorMessage());
        } else {
            return events;
        }
    },

    _getValidStatesForErrorMessage: function() {
        var states = this._props.states || {};
        return Object.keys(states);
    },

    _getInvalidStateError: function(type, transition, state, stateType) {
        return new Error("StateMachine Error: " + type + " " + JSON.stringify(transition) + "\n" +
            "  Invalid " + (stateType ?"'"+stateType+"' " : "") + "state: " + state + "\n" +
            "  Valid states: " + this._getValidStatesForErrorMessage().join(', '));
    },

    _getInvalidEventError: function(type, transition, event) {
        return new Error("StateMachine Error: " + type + " " + JSON.stringify(transition) + "\n" +
            "  Invalid event: " + event + "\n" +
            "  Valid events: " + this._getValidEventsForErrorMessage().join(', '));
    },

    _getMissingPropertyError: function(type, transition, stateType) {
        return new Error("StateMachine Error: " + type + " " + JSON.stringify(transition) + "\n" +
            "  Missing " + (stateType ?"'"+stateType+"' " : "") + "property.");
    },

    _listenForEventHandlers: function(enterObservablesByState) {

        var eventHandlers = this._props.eventHandlers;

        for (var idx in eventHandlers) {

            var eventHandler = eventHandlers[idx];
            var event = eventHandler.event;
            var state = eventHandler.state;
            var handler = eventHandler.handler;

            if (state && !this._props.states[state])
                throw this._getMissingPropertyError('Event Handler', transition, 'state');
            if (typeof handler !== 'function')
                throw new Error("Expected handler function");

            var eventStream = this.getEvent(event);
            if (!eventStream)
                throw this._getInvalidEventError('Event Handler', eventHandler, event);

            eventStream = eventStream
                .takeUntil(this.exits)
                .doAction(function invokeHandler(handler, data) {
                    var couldAccessPrivateEvents = this._canAccessPrivateEvents;
                    this._canAccessPrivateEvents = true;
                    var state = this._activeStates[this.currentStateName]
                    handler(state, data)
                    this._canAccessPrivateEvents = couldAccessPrivateEvents;
                }.bind(this, handler));

            if (state) {
                enterObservablesByState[state] = enterObservablesByState[state] || [];
                enterObservablesByState[state].push(eventStream);
            } else {
                eventStream.subscribe(NOOP);
            }

        }

    },

    _listenForEventTransitions: function(enterObservablesByState) {

        var transitions = this._props.transitions;

        for (var idxTransition in transitions) {

            var transition = transitions[idxTransition];
            var from = transition.from;
            var to = transition.to;

            if (from && !this._props.states[from])
                throw this._getInvalidStateError('Transition', transition, from, 'from');
            if (!to)
                throw this._getMissingPropertyError('Transition', transition, 'to');
            if (to && !this._props.states[to])
                throw this._getInvalidStateError('Transition', transition, to, 'to');

            var event = transition.event;
            var eventStream = this.getEvent(event);
            if (!eventStream)
                throw this._getInvalidEventError('Transition', transition, event);

            eventStream = eventStream
                .takeUntil(this.exits)
                .doAction(this.transition.bind(this, to));

            if (from) {
                enterObservablesByState[from] = enterObservablesByState[from] || [];
                enterObservablesByState[from].push(eventStream);
            } else {
                eventStream.subscribe(NOOP);
            }

        }
    },

    enter: function(data) {
        if (this._entered) {
            return;
        }
        var couldAccessPrivateEvents = this._canAccessPrivateEvents;

        this._canAccessPrivateEvents = true;
        this._entered = true; // we set this flag here so we can transition more on the way in
        this._enters && this._enters.onNext(data);
        this._isTransitioning = true;

        var beforeEnter = this._behavior.beforeEnter;
        var onEnter = this._props.onEnter;
        var afterEnter = this._behavior.afterEnter;

        try {
            beforeEnter && beforeEnter.call(this, this, data);
            onEnter && onEnter.call(this, this, data);
            afterEnter && afterEnter.call(this, this, data);
        } catch (e) {
            this._hasQueuedExit = true;
            this._queuedExitData = e;
        }

        this._isTransitioning = false;

        var enterObservablesByState = {};
        this._enterObservablesByState = enterObservablesByState;
        this._listenForEventTransitions(enterObservablesByState);
        this._listenForEventHandlers(enterObservablesByState);
        // allow before/on/afterEnter to transition us first
        if (this._hasQueuedExit || this._queuedTransitions.length) {
            this.transition();
        } else {
            this.transition(this._props.start, data);
        }

        this._canAccessPrivateEvents = couldAccessPrivateEvents;
    },

    _getOrCreateNestedState: function(stateName, stateProps, stateBehavior) {
        var nestedState = this._activeStates[stateName];
        if (nestedState) {
            return nestedState;
        }
        var nestedStateMachineFactory = this._nestedStateMachineFactories[stateName];
        nestedState = nestedStateMachineFactory
            ? nestedStateMachineFactory.create(stateBehavior, this)
            : new State(stateProps, stateBehavior, this);
        this._activeStates[stateName] = nestedState;
        return nestedState;
    },

    _enterNestedState: function(stateName, stateProps, stateBehavior, data) {
        this.currentStateName = stateName;
        var nestedState = this._getOrCreateNestedState(stateName, stateProps, stateBehavior);
        var enterObservablesByState = this._enterObservablesByState;
        var listOfObservables = enterObservablesByState && enterObservablesByState[stateName];
        if (Array.isArray(listOfObservables)) {
            for (var idx = 0; idx < listOfObservables.length; ++idx) {
                listOfObservables[idx]
                    .takeUntil(nestedState.exits)
                    .subscribe(NOOP); // the observable will transition for us
            }
        }
        nestedState.enter(data);
    },

    exit: function(data) {
        if (!this._entered) {
            return;
        }
        if (this._isTransitioning) {
            this._hasQueuedExit = true;
            this._queuedExitData = data;
            return;
        }

        var couldAccessPrivateEvents = this._canAccessPrivateEvents;
        this._canAccessPrivateEvents = true;

        this._entered = false; // we set this flag here so we can't transition on the way out
        this._transitions && this._transitions.onNext({ from: this.currentStateName, to: null });
        this._exitNestedState(
            this.currentStateName,
            this._props.states[this.currentStateName],
            tryToGet(this._behavior.states, this.currentStateName),
            data
        );

        var beforeExit = this._behavior.beforeExit;
        var onExit = this._props.onExit;
        var afterExit = this._behavior.afterExit;

        beforeExit && beforeExit.call(this, this, data);
        onExit && onExit.call(this, this, data);
        afterExit && afterExit.call(this, this, data);
        this._exits && this._exits.onNext(data);

        this._canAccessPrivateEvents = couldAccessPrivateEvents;
    },

    _exitNestedState: function(stateName, stateProps, stateBehavior, data) {
        var nestedState = this._activeStates[stateName];
        if (nestedState) {
            nestedState.exit(data);
            delete this._activeStates[stateName];
        }
        this.currentStateName = null;
        return nestedState;
    },

    _isTransitionAllowed: function(lastStateName, nextStateName, lastState, nextState) {
        if (!nextState) { return false; }
        var isSelfTransition = lastStateName === nextStateName;
        var allowSelfTransitions = !!this._props.allowSelfTransitions;

        if (isSelfTransition && !allowSelfTransitions) {
            return false;
        }

        var canExit = lastState && lastState.canExit;
        var canEnter = nextState && nextState.canEnter;
        var lastNestedState = this._activeStates[lastStateName];
        if (canExit && !canExit.call(lastNestedState, lastNestedState) ||
            canEnter && !canEnter.call(lastNestedState, lastNestedState))
        {
            return false;
        }

        return true;
    },

    transition: function(stateName, data) {
        if (!this._entered) {
            return;
        }
        var props = this._props;
        var behavior = this._behavior;
        if (this._isTransitioning && stateName) {
            this._queuedTransitions.push({ name: stateName, data: data });
            return;
        }

        var couldAccessPrivateEvents = this._canAccessPrivateEvents;
        this._canAccessPrivateEvents = true;

        this._isTransitioning = true;

        if (stateName) {
            this._queuedTransitions.push({ name: stateName, data: data });
        }

        try {
            while (this._queuedTransitions.length) {

                var lastStateName = this.currentStateName;
                var queuedEnter = this._queuedTransitions.shift();
                var nextStateName = queuedEnter.name;
                var data = queuedEnter.data;
                var lastState = props.states[lastStateName];
                var nextState = props.states[nextStateName];
                if (!this._isTransitionAllowed(lastStateName, nextStateName, lastState, nextState)) {
                    continue;
                }

                var lastNestedState = this._exitNestedState(
                    lastStateName,
                    lastState,
                    tryToGet(behavior, 'states', lastStateName),
                    data
                );

                var nextStateBehavior = tryToGet(behavior, 'states', nextStateName);
                var nextNestedState = this._getOrCreateNestedState(nextStateName, nextState, nextStateBehavior);

                this._transitions && this._transitions.onNext({ from: lastStateName, to: nextStateName });

                this._enterNestedState(
                    nextStateName,
                    nextState,
                    nextStateBehavior,
                    data
                );
            }
        } catch(e) {
            this._hasQueuedExit = true;
            this._queuedExitData = e;
        }

        this._isTransitioning = false;
        this._canAccessPrivateEvents = couldAccessPrivateEvents;

        if (this._hasQueuedExit) {
            var data = this._queuedExitData;
            this._hasQueuedExit = false;
            this._queuedExitData = undefined;
            this.exit(data);
        }
    },

    /**
     * Sets a mutable property on this State object.
     *
     * @param {String} name
     * @param {?} value
     */
    setProperty: function(name, value) {
        var properties = this._properties || {};
        properties[name] = value;
        this._properties = properties;
    },

    /**
     * Gets a mutable property from this State object.
     *
     * @param {String} name
     * @return {?} value
     */
    getProperty: function(name) {
        if (this._properties) {
            return this._properties[name];
        }
    }

};

module.exports = StateMachine;
