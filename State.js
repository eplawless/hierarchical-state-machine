var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var Event = require('./Event');
var NOOP = function() {};

/**
 * An individual state within a state machine.
 * Not necessarily intended for use standalone, but instead as part of a StateMachine.
 *
 * @param {Object}    [props]            The core functionality of this state.
 * @param {Function}   [props.canEnter]  If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function}   [props.canExit]   If canExit returns falsy we cancel an attempt to exit.
 * @param {Function}   [props.onEnter]   Called when this state is entered.
 * @param {Function}   [props.onExit]    Called when this state is exited.
 * @param {Object}     [props.transitionOnEvents]  Collection of eventName: 'stateName' pairs
 *   for use by our parent StateMachine
 *
 * @param {Object}    [behavior]               Provides additional hooks and functionality.
 * @param {Function}   [behavior.beforeEnter]  Called just before props.onEnter.
 * @param {Function}   [behavior.afterEnter]   Called just after props.onEnter.
 * @param {Function}   [behavior.beforeExit]   Called just before props.onExit.
 * @param {Function}   [behavior.afterExit]    Called just after props.onExit.
 *
 * @param {StateMachine} [parent]  This state's parent state machine.
 */
function State(props, behavior, parent) {
    this._props = props;
    this._entered = false;
    this._behavior = behavior;
    this.parent = parent;
}

State.prototype = {

    __proto__: State.prototype, // for .constructor queries

    /**
     * Lazily-instantiated Observable fired just before the before/on/afterEnter handlers.
     * @type {Observable}
     */
    get enters() {
        if (!this._enters) { this._enters = new Event; }
        return this._enters;
    },

    /**
     * Lazily-instantiated Observable fired just after the before/on/afterExit handlers.
     * @type {Observable}
     */
    get exits() {
        if (!this._exits) { this._exits = new Event; }
        return this._exits;
    },

    /**
     * Listens for events which would cause transitions out of this state in our parent StateMachine.
     *
     * Rather than having transitionOnEvents live in the containing StateMachine, our rationale
     * is that it's more semantically obvious to have it on the State's properties.
     */
    _listenForEventTransitions: function() {
        var parentState = this.parent;
        var transitionOnEvents = tryToGet(this, '_props', 'transitionOnEvents');
        var parentTransitionMethod = tryToGet(parentState, 'transition');
        if (!parentTransitionMethod) {
            return;
        }
        for (var eventName in transitionOnEvents) {
            var stateName = transitionOnEvents[eventName];
            var observer = {
                onNext: function(stateName) {
                    tryToCall(parentTransitionMethod, parentState, stateName);
                }.bind(null, stateName), // don't capture, we're in a loop
                onError: NOOP,
                onCompleted: NOOP
            };
            this.getEvent(eventName)
                .takeUntil(this.exits)
                .subscribe(observer);
        }
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
     * @return {Boolean} Whether we were able to enter the state.
     */
    enter: function() {
        if (!this.canEnter())
            return false;
        this._entered = true;
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this);
        this._listenForEventTransitions();
        return true;
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
     * @return {Boolean} Whether we were able to exit the state.
     */
    exit: function() {
        if (!this.canExit())
            return false;
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this);
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this);
        tryToCall(tryToGet(this, '_behavior', 'afterExit'), this, this);
        this._exits && this._exits.onNext();
        this._entered = false;
        return true;
    },

    /**
     * Whether we're currently allowed to enter this state. Relies on our props.canEnter method
     * from the constructor.
     *
     * @return {Boolean} Whether we're allowed to enter the state.
     */
    canEnter: function() {
        if (this._entered)
            return false;
        var canEnter = tryToGet(this, '_props', 'canEnter');
        if (canEnter && !tryToCall(canEnter, this, this))
            return false;
        return true;
    },

    /**
     * Whether we're currently allowed to exit this state. Relies on our props.canExit method
     * from the constructor.
     *
     * @return {Boolean} Whether we're allowed to exit the state.
     */
    canExit: function() {
        if (!this._entered)
            return false;
        var canExit = tryToGet(this, '_props', 'canExit');
        if (canExit && !tryToCall(canExit, this, this))
            return false;
        return true;
    },

    getEvent: function(name, scope) {
        return this.getParentEvent(name, scope || this);
    },

    getParentEvent: function(name, scope) {
        var parent = this.parent;
        return tryToCall(tryToGet(parent, 'getEvent'), parent, name, scope);
    },

};

module.exports = State;
