var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var Event = require('./Event');
var State = require('./State');
var UNIT = Object.freeze({});

/**
 * A hierarchical state machine (or state chart).
 *
 * @param {Object}         props                  The core functionality of this state machine.
 * @param {String}         props.start            The name of this state machine's initial state.
 * @param {Array|Object}   props.states           A list (or map) of state names (or configurations).
 * @param {Array}          [props.events]         A list of the names of event streams to create.
 * @param {Array}          [props.transitions]    A list of transition description objects;
 * @param {String}         [props.transitions[0].event]  The name of the event which triggers this transition.
 * @param {String}         [props.transitions[0].from]   The name of the state we're transitioning from.
 * @param {String}         [props.transitions[0].to]     The name of the state we're transitioning to.
 * @param {Boolean}        [props.allowSelfTransitions=false]  Whether to allow self-transitions.
 *
 * @param {Function}       [props.canEnter]       If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function}       [props.canExit]        If canExit returns falsy we cancel an attempt to exit.
 * @param {Function}       [props.onEnter]        Called when this state machine is entered.
 * @param {Function}       [props.onExit]         Called when this state machine is exited.
 *
 * @param {Object}         [behavior]             Provides additional hooks and functionality.
 *
 * @param {StateMachine}   [parent]             This state machine's parent state machine.
 */
function StateMachine(props, behavior, parent) {

    if (!props || typeof props !== 'object') {
        throw new Error('StateMachine constructor requires properties object');
    }

    behavior = (behavior && typeof behavior === 'object') ? behavior : UNIT;

    this._props = props;
    this._behavior = behavior;
    this.parent = parent;

    this._nestedStates = {};
    this._queuedEnters = [];

    this._props.states = this._createStatesObject(this._props.states);
    this._props.allowSelfTransitions = !!this._props.allowSelfTransitions;

    if (typeof this._props.start !== 'string')
        throw new Error('StateMachine requires properties.start to be a string');
    if (!this._props.states[this._props.start])
        throw new Error('StateMachine\'s initial state "' + this._props.start + '" doesn\'t exist');

    this._nestedStateMachineFactories = this._createNestedStateMachineFactories(this._props.states);
    this._events = this._createEvents(this._props);

}

StateMachine.prototype = {

    __proto__: StateMachine.prototype, // for .constructor support

    _props: null,
    _behavior: null,
    _entered: false,
    _hasQueuedExit: false,
    _queuedExitData: undefined,
    _queuedEnters: null,
    _isTransitioning: false,

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

    _createEvents: function(props) {
        var result = {};
        var listOfEvents = props.events || [];
        if (Array.isArray(listOfEvents)) {
            listOfEvents.forEach(function(name) {
                result[name] = new Event;
            })
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
        return tryToCall(tryToGet(parent, 'getEvent'), parent, name);
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

    getEvent: function(name) {
        return this._events[name] || this.getParentEvent(name);
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

    _getValidEvents: function() {
        var events = this._props.events || [];
        var parent = this.parent;
        if (parent && parent._getValidEvents) {
            return events.concat(parent._getValidEvents());
        } else {
            return events;
        }
    },

    _getValidStates: function() {
        var states = this._props.states || {};
        return Object.keys(states);
    },

    _getInvalidStateError: function(transition, state, stateType) {
        return new Error("StateMachine Error: Transition " + JSON.stringify(transition) + "\n" +
            "  Invalid " + stateType + " state: " + state + "\n" +
            "  Valid states: " + this._getValidStates().join(', '));
    },

    _getInvalidEventError: function(transition, event) {
        return new Error("StateMachine Error: Transition " + JSON.stringify(transition) + "\n" +
            "  Invalid event: " + event + "\n" +
            "  Valid events: " + this._getValidEvents().join(', '));
    },

    _getMissingToStateError: function(transition) {
        return new Error("StateMachine Error: Transition " + JSON.stringify(transition) + "\n" +
            "  Missing 'to' state.");
    },

    _listenForEventTransitions: function() {
        var self = this;
        var transitions = this._props.transitions;
        for (var idxTransition in transitions) {
            var transition = transitions[idxTransition];
            var event = transition.event;
            var from = transition.from;
            var to = transition.to;

            var eventStream = this.getEvent(event);
            if (!eventStream) {
                throw this._getInvalidEventError(transition, event);
            }
            if (from && !this._props.states[from]) {
                throw this._getInvalidStateError(transition, from, 'from');
            }
            if (!to) {
                throw this._getMissingToStateError(transition);
            }
            if (to && !this._props.states[to]) {
                throw this._getInvalidStateError(transition, to, 'to');
            }
            if (from) {
                eventStream = eventStream
                    .where(function isInFromState(from) {
                        return self.currentStateName === from;
                    }.bind(null, from));
            }
            eventStream
                .takeUntil(this.exits)
                .subscribe(this.transition.bind(this, to));
        }
    },

    enter: function(data) {
        if (this._entered) {
            return;
        }
        this._entered = true; // we set this flag here so we can transition more on the way in
        this._enters && this._enters.onNext(data);
        this._isTransitioning = true;
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, data);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, data);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, data);
        this._isTransitioning = false;
        this._listenForEventTransitions();
        if (this._queuedEnters.length) { // allow before/on/afterEnter to transition us first
            this.transition();
        } else {
            this.transition(this._props.start, data);
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

    _enterNestedState: function(stateName, stateProps, stateBehavior, data) {
        this.currentStateName = stateName;
        var nestedState = this._getOrCreateNestedState(stateName, stateProps, stateBehavior);
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
        this._entered = false; // we set this flag here so we can't transition on the way out
        this._transitions && this._transitions.onNext({ from: this.currentStateName, to: null });
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, '_props', 'states', this.currentStateName),
            tryToGet(this, '_behavior', 'states', this.currentStateName),
            data
        );
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this, data);
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this, data);
        tryToCall(tryToGet(this, '_behavior', 'afterExit'), this, this, data);
        this._exits && this._exits.onNext(data);
    },

    _exitNestedState: function(stateName, stateProps, stateBehavior, data) {
        var nestedState = this._nestedStates[stateName];
        if (nestedState) {
            nestedState.exit(data);
            delete this._nestedStates[stateName];
        }
        this.currentStateName = null;
        return nestedState;
    },

    _runTransitionHandlers: function(lastStateName, nextStateName, lastNestedState, nextNestedState) {
        var lastStateProps = tryToGet(this._props, 'states', lastStateName);
        var lastStateBehavior = tryToGet(this._behavior, 'states', lastStateName);
        this._transitions && this._transitions.onNext({ from: lastStateName, to: nextStateName });
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

        if (isSelfTransition && !allowSelfTransitions) {
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

    transition: function(stateName, data) {
        if (!this._entered) {
            return;
        }
        var props = this._props;
        var behavior = this._behavior;
        if (this._isTransitioning && stateName) {
            this._queuedEnters.push({ name: stateName, data: data });
            return;
        }

        this._isTransitioning = true;

        if (stateName) {
            this._queuedEnters.push({ name: stateName, data: data });
        }
        while (this._queuedEnters.length) {
            var lastStateName = this.currentStateName;
            var queuedEnter = this._queuedEnters.shift();
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

            this._runTransitionHandlers(lastStateName, nextStateName, lastNestedState, nextNestedState, data);

            this._enterNestedState(
                nextStateName,
                nextState,
                nextStateBehavior,
                data
            );
        }

        this._isTransitioning = false;
        if (this._hasQueuedExit) {
            var data = this._queuedExitData;
            this._hasQueuedExit = false;
            this._queuedExitData = undefined;
            this.exit(data);
        }
    }
};

module.exports = StateMachine;
