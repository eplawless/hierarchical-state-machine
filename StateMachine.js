var ImmortalSubject = require('./ImmortalSubject');
var TransitionInfo = require('./TransitionInfo');
var ErrorContext = require('./ErrorContext');
var Event = require('./Event');
var State = require('./State');
var UNIT = Object.freeze({});
var UNIT_ARRAY = Object.freeze([]);
function NOOP() {}

/**
 * A hierarchical state machine (or state chart).
 *
 * @param {Object}  props  The core functionality of this state machine.
 * @param {String}  props.start  The name of this state machine's initial state.
 * @param {Array|Object}  props.states  A list (or map) of state names (or configurations).
 *
 * @param {Function}  [props.canEnter]  If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function}  [props.canExit]  If canExit returns falsy we cancel an attempt to exit.
 * @param {Function}  [props.onEnter]  Called when this state machine is entered.
 * @param {Function}  [props.onExit]  Called when this state machine is exited.
 *
 * @param {Array}  [props.inputEvents]  A list of the names of valid input events.
 * @param {Array}  [props.internalEvents]  A list of the names of valid internal events.
 * @param {Array}  [props.outputEvents]  A list of the names of output event streams to create.
 * @param {Object}  [props.eventHandlers]  A map of event names to handlers.
 *
 * @param {Array}  [props.transitions]  A list of transition description objects.
 * @param {String}  props.transitions[0].event  The name of the event which triggers this transition.
 * @param {String}  props.transitions[0].to  The name of the state we're transitioning to.
 * @param {String}  [props.transitions[0].from]  The name of the state we're transitioning from.
 * @param {Function}  [props.transitions[0].predicate]  Returns whether we're allowed to transition.
 * @param {Boolean}  [props.transitions[0].allowSelfTransition]
 *  Whether this transition (without a 'from' property) can result in a self-transition on a state.
 *  This means it would exit the current state and re-enter it.
 *
 * @param {Array}    [props.transientData]
 *  A list of mutable values you can store on this state. Transient data are removed on exit.
 * @param {Array}    [props.persistentData]
 *  A list of mutable values you can store on this state. Persistent data are *not* removed on exit.
 *
 * @param {Function}  [props.onUncaughtException]
 *  Called when an exception is caught by the state machine.
 *  This callback takes two arguments: the state at the level it's declared, and an error event.
 *  The error event provides a stopPropagation() method which tells the FSM you've successfully
 *  dealt with the error and it doesn't need to continue. If nobody deals with the error, the
 *  state machine will be exited and the error rethrown.
 *
 * @param {Object}  [behavior]  Provides additional hooks and functionality.
 * @param {Function}  [behavior.beforeEnter]  Called just before props.onEnter.
 * @param {Function}  [behavior.afterEnter]  Called just after props.onEnter.
 * @param {Function}  [behavior.beforeExit]  Called just before props.onExit.
 * @param {Function}  [behavior.afterExit]  Called just after props.onExit.
 *
 * @param {StateMachine}  [parent]  This state machine's parent state machine.
 * @param {Boolean}  [returnRawStateMachine]  Whether we should skip creating a StateMachineHandle
 */
function StateMachine(props, behavior, parent, returnRawStateMachine) {

    if (!props || typeof props !== 'object') {
        throw new Error('StateMachine constructor requires properties object');
    }

    props.states = this._createStatesObject(props.states);
    State.call(this, props, behavior, parent);

    if (typeof this._props.start !== 'string')
        throw new Error('StateMachine requires props.start to be a string');

    if (!this._props.states[this._props.start])
        throw new Error('StateMachine\'s initial state "' + this._props.start + '" doesn\'t exist');

    this._childStates = {};
    this._queuedTransitions = [];

    return returnRawStateMachine ? this : new StateMachineHandle(this);
}

StateMachine.prototype = {

    __proto__: State.prototype, // for .constructor support

    _hasQueuedExit: false,
    _queuedExitData: undefined,
    _hasQueuedEnter: false,
    _queuedEnterData: undefined,
    _queuedTransitions: null,
    _isTransitioning: false,

    /**
     * The name of the currently active state.
     * @type {String}
     */
    currentStateName: null,

    /**
     * Builds out an internal map from events to arrays of transition descriptor objects.
     * Takes transitions best dealt with by our child states and makes sure they get passed
     * along to our child states' constructors.
     *
     * @param {Array} transitions
     * @return {Object} map of events to lists of transition descriptor objects
     */
    _createListOfTransitionsByEvent: function(transitions) {
        var result = {};
        if (!Array.isArray(transitions)) {
            return result;
        }

        for (var idx = 0; idx < transitions.length; ++idx) {
            var transition = transitions[idx];
            var from = transition.from;
            var to = transition.to;
            var event = transition.event;
            var allowSelfTransition = transition.allowSelfTransition;
            var predicate = transition.predicate;
            var isParentTransition = transition.parent;
            if (isParentTransition && !this.parent)
                throw this._getMissingPropertyError('Transition', transition, 'parent');

            var self = isParentTransition ? this.parent : this;

            if (from && !self._props.states[from])
                throw this._getInvalidStateError('Transition', transition, from, 'from');
            if (!to)
                throw this._getMissingPropertyError('Transition', transition, 'to');
            if (to && !self._props.states[to])
                throw this._getInvalidStateError('Transition', transition, to, 'to');
            if (!event)
                throw this._getMissingPropertyError('Transition', transition, 'event');
            if (!self._getSelfOrAncestorWithEvent(event, false, false))
                throw this._getInvalidPropertyError('Transition', transition, 'event');
            if (predicate && typeof predicate !== 'function')
                throw this._getInvalidPropertyError('Transition', transition, 'predicate');

            if (!isParentTransition && from) {
                var fromStateProps = self._props.states[from];
                if (!fromStateProps)
                    throw this._getMissingPropertyError('Transition', transition, 'states.'+from);
                var fromStateTransitions = fromStateProps.transitions || [];
                if (!Array.isArray(fromStateTransitions)) {
                    throw this._getInvalidPropertyError('Transition', transition, 'states.'+from+'.transitions');
                }
                fromStateTransitions.push({
                    event: event,
                    to: to,
                    allowSelfTransition: true,
                    parent: true,
                    predicate: predicate
                });
                fromStateProps.transitions = fromStateTransitions;
            } else {
                var listOfTransitions = result[event] || [];
                listOfTransitions.push({
                    to: to,
                    allowSelfTransition: allowSelfTransition,
                    parent: transition.parent,
                    predicate: predicate
                });
                result[event] = listOfTransitions;
            }
        }

        return result;
    },

    /**
     * Takes any of the accepted formats for states (array of strings, array of state descriptor
     * objects with 'name' properties, mixed array of both, or a map of state name to state descriptor)
     * and normalizes them to a map of state name to state descriptor.
     *
     * @param {Array|Object} states
     * @return {Object} states
     */
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

    /**
     * Return the currently active state, if any.
     *
     * @return {State}
     */
    _getCurrentState: function() {
        var childStates = this._childStates;
        return childStates && childStates[this.currentStateName];
    },

    /**
     * Get an observable of all state transitions.
     *
     * @return {Observable}
     */
    get transitions() {
        if (!this._transitions) { this._transitions = new ImmortalSubject; }
        return this._transitions;
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

    /**
     * @param {String} name  The name of the event to fire.
     * @param {?} [data]  Optional data to pass into the event.
     * @return {Boolean}  Whether the event was handled.
     */
    _fireEvent: function(name, data) {
        // let our current state handle this first
        var currentState = this._getCurrentState();
        if (currentState && currentState._fireEvent(name, data)) {
            return true;
        }

        // fire event handlers before transitions
        var eventHandlers = this._props.eventHandlers;
        var eventHandler = eventHandlers && eventHandlers[name];
        if (typeof eventHandler === 'function') {
            var event = new Event(name, data);
            eventHandler(this, event);
            if (event.isHandled)
                return true;
        }

        // fire transitions
        var listOfTransitions = this._listOfTransitionsByEvent[name] || UNIT_ARRAY;
        for (var idx = 0; idx < listOfTransitions.length; ++idx) {
            var transition = listOfTransitions[idx];
            if (transition.predicate) {
                var predicate = transition.predicate;
                if (!predicate.call(this, this, data)) {
                    continue;
                }
            }
            if (transition.parent && this.parent) {
                this.parent._transition(transition.to, data, transition.allowSelfTransition);
                return true;
            } else if (!transition.parent) {
                this._transition(transition.to, data, transition.allowSelfTransition);
                return true;
            }
        }
        return false;
    },

    /**
     * Enters this state and recursively enters its child states.
     *
     * @param {?} data  extra information to pass along to lifecycle methods (e.g. onEnter, onExit)
     */
    enter: function(data) {
        if (this._entered) {
            if (!this._hasQueuedExit) {
                return;
            } else {
                this._hasQueuedEnter = true;
                this._queuedEnterData = data;
                return;
            }
        }

        var event;
        if (data instanceof TransitionInfo) {
            event = data;
            data = event.data;
        } else {
            event = new TransitionInfo(null, this._props.start, data);
        }

        this._hasQueuedEnter = false;
        this._queuedEnterData = undefined;
        this._entered = true; // we set this flag here so we can transition more on the way in
        this._enters && this._enters.onNext(event);
        this._isTransitioning = true;

        var beforeEnter = this._behavior.beforeEnter;
        var onEnter = this._props.onEnter;
        var afterEnter = this._behavior.afterEnter;

        try {
            beforeEnter && beforeEnter.call(this, this, event);
            onEnter && onEnter.call(this, this, event);
            afterEnter && afterEnter.call(this, this, event);
            this._isTransitioning = false;
        } catch (e) {
            this._onUncaughtException(e);
        }

        // allow before/on/afterEnter to transition us first
        if (this._hasQueuedExit || this._queuedTransitions.length) {
            this._transition();
        } else {
            this._transition(this._props.start, data);
        }
    },

    /**
     *
     */
    _getOrCreateChildState: function(stateName, stateProps, stateBehavior) {
        var childState = this._childStates[stateName];
        if (childState) {
            return childState;
        }
        // assume a start property means a state machine
        var Constructor = (stateProps && stateProps.start) ? StateMachine : State;
        var returnRawStateMachine = true;
        childState = new Constructor(stateProps, stateBehavior, this, returnRawStateMachine);
        this._childStates[stateName] = childState;
        return childState;
    },

    _enterChildState: function(stateName, stateProps, stateBehavior, data) {
        this.currentStateName = stateName;
        var childState = this._getOrCreateChildState(stateName, stateProps, stateBehavior);
        childState.enter(data);
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
        var thrownError;
        try {

            var event = data;
            if (event instanceof TransitionInfo) {
                data = event.data;
            } else {
                event = new TransitionInfo(this.currentStateName, null, data);
            }

            var behaviorStates = this._behavior.states;
            this._transitions && this._transitions.onNext({ from: this.currentStateName, to: null });
            this._exitChildState(
                this.currentStateName,
                this._props.states[this.currentStateName],
                behaviorStates && behaviorStates[this.currentStateName],
                event
            );

            var beforeExit = this._behavior.beforeExit;
            var onExit = this._props.onExit;
            var afterExit = this._behavior.afterExit;

            beforeExit && beforeExit.call(this, this, event);
            onExit && onExit.call(this, this, event);
            afterExit && afterExit.call(this, this, event);
        } catch (error) {
            thrownError = error;
        }

        delete this._transientDataByName;

        // garbage collect any states without persistent data
        for (var stateName in this._childStates) {
            var state = this._childStates[stateName];
            if (!state._hasPersistentState()) {
                delete this._childStates[stateName];
            }
        }

        try {
            this._exits && this._exits.onNext(event);
        } catch (error) {
            thrownError = thrownError || error;
        }

        this._hasQueuedExit = false;
        delete this._queuedExitData;
        this._queuedTransitions.length = 0;

        if (thrownError) {
            this._onUncaughtException(thrownError);
        }
    },

    _exitChildState: function(stateName, stateProps, stateBehavior, data) {
        var childState = this._childStates[stateName];
        if (childState) {
            childState.exit(data);
        }
        this.currentStateName = null;
        return childState;
    },

    _transition: function(stateName, data, allowSelfTransition) {
        if (!this._entered) {
            return;
        }
        var props = this._props;
        var behaviorStates = this._behavior.states;
        if (this._isTransitioning && stateName) {
            this._queuedTransitions.push({
                name: stateName,
                data: data,
                allowSelfTransition: allowSelfTransition
            });
            return;
        }

        this._isTransitioning = true;

        if (stateName) {
            this._queuedTransitions.push({
                name: stateName,
                data: data,
                allowSelfTransition: allowSelfTransition
            });
        }

        var thrownError;
        try {
            while (this._queuedTransitions.length) {
                var lastStateName = this.currentStateName;
                var queuedEnter = this._queuedTransitions.shift();
                var nextStateName = queuedEnter.name;

                var event;
                var data = queuedEnter.data;
                if (data instanceof TransitionInfo) {
                    event = data;
                    data = event.data;
                } else {
                    event = new TransitionInfo(lastStateName, nextStateName, data);
                }

                var allowSelfTransition = queuedEnter.allowSelfTransition;
                var lastStateProps = props.states[lastStateName];
                var nextStateProps = props.states[nextStateName];
                if (!nextStateProps || (lastStateName === nextStateName && !allowSelfTransition)) {
                    continue;
                }

                var lastChildState = this._exitChildState(
                    lastStateName,
                    lastStateProps,
                    behaviorStates && behaviorStates[lastStateName],
                    event
                );

                // TODO: fire before exiting?
                this._transitions && this._transitions.onNext(event);

                this._enterChildState(
                    nextStateName,
                    nextStateProps,
                    behaviorStates && behaviorStates[nextStateName],
                    event
                );

                var currentState = this._getCurrentState();
                if (!currentState || !currentState.isEntered) {
                    this._hasQueuedExit = true;
                    this._queuedTransitions.length = 0;
                }
            }
        } catch (error) {
            thrownError = error;
        }

        this._isTransitioning = false;

        if (thrownError) {
            this._onUncaughtException(thrownError);
        }

        if (this._hasQueuedExit) {
            var data = this._queuedExitData;
            this._hasQueuedExit = false;
            this._queuedExitData = undefined;
            this.exit(data);
        }
        if (this._hasQueuedEnter) {
            var data = this._queuedEnterData;
            this._hasQueuedEnter = false;
            this._queuedEnterData = undefined;
            this.enter(data);
        }
    },

    /**
     * Whether this state or any of its descendants have persistent state.
     * @return {Boolean}
     */
    _hasPersistentState: function() {
        if (State.prototype._hasPersistentState.call(this)) {
            return true;
        }
        for (var stateName in this._childStates) {
            var state = this._childStates[stateName];
            if (state._hasPersistentState()) {
                return true;
            }
        }
        return false;
    },

    /**
     * @override State#_cleanUpStateForUncaughtException
     */
    _cleanUpStateForUncaughtException: function() {
        delete this._hasQueuedEnter;
        delete this._hasQueuedExit;
        delete this._queuedEnterData;
        delete this._queuedExitData;
        delete this._isTransitioning;
        this._queuedTransitions.length = 0;
    },

};

/**
 * A reference to a state machine which enforces public/private and input/output
 * conventions on event streams. Exposes the same public interface as StateMachine.
 */
function StateMachineHandle(stateMachine) {
    this._stateMachine = stateMachine;
}

StateMachineHandle.prototype = {

    __proto__: StateMachineHandle.prototype, // for constructor queries

    // properties
    get isEntered() { return this._stateMachine.isEntered; },
    get enters() { return this._stateMachine.enters; },
    get exits() { return this._stateMachine.exits; },
    get transitions() { return this._stateMachine.transitions; },
    get currentStateName() { return this._stateMachine.currentStateName; },

    // methods
    setBehavior: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.setBehavior.apply(stateMachine, arguments);
    },
    fireEvent: function(name, data) {
        var isPublicAccess = true;
        return this._stateMachine.fireEvent(name, data, isPublicAccess);
    },
    getEvents: function(name) {
        var isPublicAccess = true;
        return this._stateMachine.getEvents(name, isPublicAccess);
    },
    enter: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.enter.apply(stateMachine, arguments);
    },
    exit: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.exit.apply(stateMachine, arguments);
    },
    getData: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.getData.apply(stateMachine, arguments);
    },
    setData: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.setData.apply(stateMachine, arguments);
    },
    hasData: function() {
        var stateMachine = this._stateMachine;
        return stateMachine.hasData.apply(stateMachine, arguments);
    },
};

module.exports = StateMachine;
