var ImmortalSubject = require('./ImmortalSubject');
var ErrorContext = require('./ErrorContext');
var Event = require('./Event');
var UNIT_ARRAY = Object.freeze([]);
var UNIT = Object.freeze({});

/**
 * An individual state within a state machine.
 * Not necessarily intended for use standalone, but instead as part of a StateMachine.
 *
 * @param {Object}     [props]           The core functionality of this state.
 * @param {Function}   [props.canEnter]  If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function}   [props.canExit]   If canExit returns falsy we cancel an attempt to exit.
 * @param {Function}   [props.onEnter]   Called when this state is entered.
 * @param {Function}   [props.onExit]    Called when this state is exited.
 *
 * @param {Object}   [props.eventHandlers]   A map of event handlers functions by event name.
 * @param {Array}    [props.inputEvents]     A list of valid input events one could fire.
 * @param {Array}    [props.outputEvents]    A list of valid output events one could listen to.
 * @param {Array}    [props.internalEvents]  A list of valid events for internal read/write use.
 *
 * @param {Array}    [props.transientData]
 *  A list of mutable values you can store on this state. Transient data are removed on exit.
 *
 * @param {Array}    [props.persistentData]
 *  A list of mutable values you can store on this state. Persistent data are *not* removed on exit.
 *
 * @param {Object}     [behavior]              Provides additional hooks and functionality.
 * @param {Function}   [behavior.beforeEnter]  Called just before props.onEnter.
 * @param {Function}   [behavior.afterEnter]   Called just after props.onEnter.
 * @param {Function}   [behavior.beforeExit]   Called just before props.onExit.
 * @param {Function}   [behavior.afterExit]    Called just after props.onExit.
 *
 * @param {StateMachine} [parent]  This state's parent state machine.
 */
function State(props, behavior, parent) {
    this._setProps(props);
    this.setBehavior(behavior);
    this.parent = parent;

    this.onError = this.onError.bind(this);

    this._eventStreams = {};
    this._listOfTransitionsByEvent = this._createListOfTransitionsByEvent(this._props.transitions);
}

State.prototype = {

    __proto__: State.prototype, // for .constructor queries

    _props: null,
    _behavior: null,
    _entered: false,
    _transientDataByName: null,
    _persistentDataByName: null,
    _eventStreams: null,
    _listOfTransitionsByEvent: null,

    get isEntered() {
        return this._entered;
    },

    _createListOfTransitionsByEvent: function(transitions) {
        var result = {};
        if (!Array.isArray(transitions)) {
            return result;
        }

        for (var idx = 0; idx < transitions.length; ++idx) {
            var transition = transitions[idx];
            var to = transition.to;
            var event = transition.event;
            var allowSelfTransition = transition.allowSelfTransition;
            var predicate = transition.predicate;
            var isParentTransition = transition.parent;
            if (isParentTransition && !this.parent) {
                throw this._getMissingPropertyError('Transition', transition, 'parent');
            }

            var selfOrParent = isParentTransition ? this.parent : this;

            if (!to) {
                throw this._getMissingPropertyError('Transition', transition, 'to');
            }
            if (!event) {
                throw this._getMissingPropertyError('Transition', transition, 'event');
            }
            if (!selfOrParent._getSelfOrAncestorWithEvent(event)) {
                throw this._getInvalidPropertyError('Transition', transition, 'event');
            }
            if (predicate && typeof predicate !== 'function') {
                throw this._getInvalidPropertyError('Transition', transition, 'predicate');
            }

            var listOfTransitions = result[event] || [];
            listOfTransitions.push({
                to: to,
                allowSelfTransition: allowSelfTransition,
                predicate: predicate
            });
            result[event] = listOfTransitions;
        }

        return result;
    },

    _getMissingPropertyError: function(type, transition, propertyName) {
        return new Error("StateMachine Error: " + type + " " + JSON.stringify(transition) + "\n" +
            "  Missing " + (propertyName ? "'" + propertyName + "' " : "") + "property.");
    },

    _getInvalidPropertyError: function(type, transition, propertyName) {
        return new Error("StateMachine Error: " + type + " " + JSON.stringify(transition) + "\n" +
            "  Invalid " + (propertyName ? "'" + propertyName + "' " : "") + "property.");
    },

    _setProps: function(props) {
        if (!props) {
            this._props = UNIT;
        } else if (typeof props === 'object') {
            this._props = props;
        } else {
            throw new Error('StateMachine requires props object');
        }
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

    /**
     * Lazily-instantiated Observable fired just before the before/on/afterEnter handlers.
     * @type {Observable}
     */
    get enters() {
        if (!this._enters) {
            this._enters = new ImmortalSubject();
        }
        return this._enters;
    },

    /**
     * Lazily-instantiated Observable fired just after the before/on/afterExit handlers.
     * @type {Observable}
     */
    get exits() {
        if (!this._exits) {
            this._exits = new ImmortalSubject();
        }
        return this._exits;
    },

    /**
     * Enter this state, if we're allowed to and not already in it. If we are allowed to enter,
     * this method invokes our various callbacks and Observables in the following order:
     *
     *   1. canEnter
     *   2. enters.onNext
     *   3. beforeEnter
     *   4. onEnter
     *   5. afterEnter
     *
     * @param {?} [data]  Optional argument to pass to callbacks and Observables.
     * @return {Boolean}  Whether we were able to enter the state.
     */
    enter: function(data) {
        try {
            if (!this.canEnter()) {
                return false;
            }

            var enters = this._enters;
            var behavior = this._behavior;
            var beforeEnter = behavior.beforeEnter;
            var onEnter = this._props.onEnter;
            var afterEnter = behavior.afterEnter;

            this._entered = true;
            if (enters) {
                enters.onNext(data);
            }
            if (beforeEnter) {
                beforeEnter(this, data);
            }
            if (onEnter) {
                onEnter(this, data);
            }
            if (afterEnter) {
                afterEnter(this, data);
            }
            return true;
        } catch (error) {
            this._onUncaughtException(error);
            return false;
        }
    },

    /**
     * Exit this state, if we're allowed to and have entered. If we are allowed to exit, this
     * method invokes our various callbacks and Observables in the following order:
     *
     *   1. canExit
     *   2. beforeExit
     *   3. onExit
     *   4. afterExit
     *   5. exits.onNext
     *
     * @param {?} [data]  Optional argument to pass to callbacks and Observables.
     * @return {Boolean} Whether we were able to exit the state.
     */
    exit: function(data) {
        try {
            if (!this.canExit()) {
                return false;
            }

            var exits = this._exits;
            var behavior = this._behavior;
            var beforeExit = behavior.beforeExit;
            var onExit = this._props.onExit;
            var afterExit = behavior.afterExit;

            if (beforeExit) {
                beforeExit(this, data);
            }
            if (onExit) {
                onExit(this, data);
            }
            if (afterExit) {
                afterExit(this, data);
            }
            if (exits) {
                exits.onNext(data);
            }
            this._entered = false;
            delete this._transientDataByName;
            if (this.parent && this.parent._entered && !this.parent._isTransitioning) {
                this.parent.exit(data);
            }
            return true;
        } catch (error) {
            this._entered = false;
            delete this._transientDataByName;
            this._onUncaughtException(error);
        }
        return false;
    },

    /**
     * Whether we're currently allowed to enter this state. Relies on our props.canEnter method
     * from the constructor.
     *
     * @param {?} [data]  Optional argument to pass to the canEnter callback.
     * @return {Boolean} Whether we're allowed to enter the state.
     */
    canEnter: function(data) {
        if (this._entered) {
            return false;
        }
        var canEnter = this._props.canEnter;
        return !canEnter || canEnter(this, data);
    },

    /**
     * Whether we're currently allowed to exit this state. Relies on our props.canExit method
     * from the constructor.
     *
     * @param {?} [data]  Optional argument to pass to the canExit callback.
     * @return {Boolean} Whether we're allowed to exit the state.
     */
    canExit: function(data) {
        if (!this._entered) {
            return false;
        }
        var canExit = this._props.canExit;
        return !canExit || canExit(this, data);
    },

    /**
     * @param {String} name  The name of the event to fire.
     * @param {?} [data]  Optional data to pass into the event.
     * @return {Boolean}  Whether the event was handled.
     */
    _fireEvent: function(name, data) {
        // fire event handlers before transitions
        var eventHandlers = this._props.eventHandlers;
        var eventHandler = eventHandlers && eventHandlers[name];
        if (typeof eventHandler === 'function') {
            var event = new Event(name, data);
            eventHandler(this, event);
            if (event.isHandled) {
                return true;
            }
        }

        // fire transitions
        var listOfTransitions = this._listOfTransitionsByEvent[name] || UNIT_ARRAY;
        for (var idx = 0; idx < listOfTransitions.length; ++idx) {
            var transition = listOfTransitions[idx];
            if (transition && this.parent) {
                if (transition.predicate) {
                    var predicate = transition.predicate;
                    if (!predicate.call(this, this, data)) {
                        continue;
                    }
                }
                this.parent._transition(transition.to, data, transition.allowSelfTransition);
                return true;
            }
        }
        return false;
    },

    /**
     * @param {String} name  The name of the event to fire.
     * @param {?} [data]  Optional data to pass into the event.
     * @param {Boolean} [isPublicAccess]  whether we should be blocked from firing private events
     * @return {Boolean}  Whether the event was handled.
     */
    fireEvent: function(name, data, isPublicAccess) {
        var isStreamAccess = false;
        var ancestor = this._getSelfOrAncestorWithEvent(name, isPublicAccess, isStreamAccess);
        if (ancestor) {
            try {
                // fire event streams first
                var eventStream = ancestor._eventStreams && ancestor._eventStreams[name];
                if (eventStream) {
                    eventStream.onNext(data);
                }

                // then fire event proper
                return ancestor._fireEvent(name, data);
            } catch (error) {
                this._onUncaughtException(error);
            }
        }
        return false;
    },

    _getSelfOrAncestorWithEvent: function(name, isPublicAccess, isStreamAccess) {
        var ancestor = this;
        while (ancestor) {
            var props = ancestor._props;
            var inputEvents = props && props.inputEvents || UNIT_ARRAY;
            var internalEvents = props && props.internalEvents || UNIT_ARRAY;
            var outputEvents = props && props.outputEvents || UNIT_ARRAY;
            var hasInputEvent = (!isPublicAccess || !isStreamAccess) && inputEvents.indexOf(name) >= 0;
            var hasInternalEvent = (!isPublicAccess) && internalEvents.indexOf(name) >= 0;
            var hasOutputEvent = (!isPublicAccess || isStreamAccess) && outputEvents.indexOf(name) >= 0;
            if (hasInputEvent || hasInternalEvent || hasOutputEvent) {
                return ancestor;
            }
            ancestor = ancestor.parent;
        }
    },

    /**
     * @param {String} name
     * @return {Observable}
     */
    _getEvents: function(name) {
        var eventStream = this._eventStreams[name];
        if (!eventStream) {
            eventStream = new ImmortalSubject();
            this._eventStreams[name] = eventStream;
        }
        return eventStream;
    },

    /**
     * @param {String} name
     * @param {Boolean} isPublicAccess
     * @return {Observable}
     */
    getEvents: function(name, isPublicAccess) {
        var isStreamAccess = true;
        var ancestor = this._getSelfOrAncestorWithEvent(name, isPublicAccess, isStreamAccess);
        if (!ancestor) {
            throw new Error('Can\'t access event stream named ' + name);
        }
        return ancestor._getEvents(name)
            .takeUntil(this.exits);
    },

    _getSelfOrAncestorWithData: function(name) {
        var ancestor = this;
        while (ancestor) {
            var transientDataNames = ancestor._props.transientData || UNIT_ARRAY;
            var persistentDataNames = ancestor._props.persistentData || UNIT_ARRAY;
            if (transientDataNames.indexOf(name) > -1 || persistentDataNames.indexOf(name) > -1) {
                return ancestor;
            }
            ancestor = ancestor.parent;
        }
    },

    _setData: function(name, value) {
        var transientDataNames = this._props.transientData || UNIT_ARRAY;
        if (transientDataNames.indexOf(name) > -1) {
            var transientDataByName = this._transientDataByName || {};
            transientDataByName[name] = value;
            this._transientDataByName = transientDataByName;
        } else { // must be persistent
            var persistentDataByName = this._persistentDataByName || {};
            persistentDataByName[name] = value;
            this._persistentDataByName = persistentDataByName;
        }
    },

    _getData: function(name) {
        var transientDataByName = this._transientDataByName || UNIT;
        var persistentDataByName = this._persistentDataByName || UNIT;
        if (name in transientDataByName) {
            return transientDataByName[name];
        }
        if (name in persistentDataByName) {
            return persistentDataByName[name];
        }
    },

    /**
     * Sets  mutable property on this State object.
     *
     * @param {String} name
     * @param {?} value
     */
    setData: function(name, value) {
        var ancestor = this._getSelfOrAncestorWithData(name);
        if (!ancestor) {
            throw new Error("State Error: Can't set undeclared data: " + name);
        }
        ancestor._setData(name, value);
    },

    /**
     * Gets a mutable property from this State object.
     *
     * @param {String} name
     * @return {?} value
     */
    getData: function(name) {
        var ancestor = this._getSelfOrAncestorWithData(name);
        if (!ancestor) {
            throw new Error("State Error: Can't get undeclared data: " + name);
        }
        return ancestor._getData(name);
    },

    /**
     * Checks for a mutable property from this State object.
     *
     * @param {String} name
     * @return {Boolean}
     */
    hasData: function(name) {
        return !!this._getSelfOrAncestorWithData(name);
    },

    /**
     * Whether this state has any internal data which needs to be persisted.
     *
     * @return {Boolean}
     */
    _hasPersistentState: function() {
        var persistentData = this._props.persistentData;
        return Array.isArray(persistentData) && persistentData.length > 0;
    },

    /**
     * Fires the _onUncaughtException handlers, and if none of them stop the error
     * event propagating, exits the whole FSM and throws the given error.
     *
     * @param {?} error
     */
    onError: function(error) {
        this._onUncaughtException(error);
    },

    /**
     * Meant to be overridden; put ourselves into a place where we can deal with an exception.
     */
    _cleanUpStateForUncaughtException: function() {
        // empty
    },

    /**
     * Fires the onUncaughtException handlers, and if none of them stop the error
     * event propagating, exits the whole FSM and throws the given error.
     *
     * @param {?} error
     */
    _onUncaughtException: function(error, context) {
        context = context || new ErrorContext(error);

        this._cleanUpStateForUncaughtException();

        // try to handle the exception
        var onUncaughtException = this._props.onUncaughtException;
        if (typeof onUncaughtException === 'function') {
            onUncaughtException(this, context);
            if (context.isHandled) {
                return true;
            }
        }

        // get our parent to try to handle it
        if (this.parent && this.parent._onUncaughtException(error, context)) {
            return true;
        }

        // give up
        this.exit(error);
        throw error;
    }

};

module.exports = State;
