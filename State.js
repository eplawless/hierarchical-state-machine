var Event = require('./Event');
var NOOP = function() {};
var UNIT = Object.freeze({});

/**
 * An individual state within a state machine.
 * Not necessarily intended for use standalone, but instead as part of a StateMachine.
 *
 * @param {Object}                [props]            The core functionality of this state.
 * @param {Function(State, [?])}   [props.canEnter]  If canEnter returns falsy we cancel an attempt to enter.
 * @param {Function(State, [?])}   [props.canExit]   If canExit returns falsy we cancel an attempt to exit.
 * @param {Function(State, [?])}   [props.onEnter]   Called when this state is entered.
 * @param {Function(State, [?])}   [props.onExit]    Called when this state is exited.
 *
 * @param {Object}                [behavior]               Provides additional hooks and functionality.
 * @param {Function(State, [?])}   [behavior.beforeEnter]  Called just before props.onEnter.
 * @param {Function(State, [?])}   [behavior.afterEnter]   Called just after props.onEnter.
 * @param {Function(State, [?])}   [behavior.beforeExit]   Called just before props.onExit.
 * @param {Function(State, [?])}   [behavior.afterExit]    Called just after props.onExit.
 *
 * @param {StateMachine} [parent]  This state's parent state machine.
 */
function State(props, behavior, parent) {
    this._props = props || UNIT;
    this._behavior = behavior || UNIT;
    this._entered = false;
    this._properties = null;
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
        if (!this.canEnter())
            return false;

        var enters = this._enters;
        var behavior = this._behavior;
        var beforeEnter = behavior.beforeEnter;
        var onEnter = this._props.onEnter;
        var afterEnter = behavior.afterEnter;

        this._entered = true;
        enters && enters.onNext(data);
        beforeEnter && beforeEnter(this, data);
        onEnter && onEnter(this, data);
        afterEnter && afterEnter(this, data);
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
     * @param {?} [data]  Optional argument to pass to callbacks and Observables.
     * @return {Boolean} Whether we were able to exit the state.
     */
    exit: function(data) {
        if (!this.canExit())
            return false;

        var exits = this._exits;
        var behavior = this._behavior;
        var beforeExit = behavior.beforeExit;
        var onExit = this._props.onExit;
        var afterExit = behavior.afterExit;

        beforeExit && beforeExit(this, data);
        onExit && onExit(this, data);
        afterExit && afterExit(this, data);
        exits && exits.onNext(data);
        this._entered = false;
        return true;
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
     * Asks its parent StateMachine for a named event stream.
     *
     * @param {String} name
     * @return {Event}
     */
    getEvent: function(name) {
        return this.getParentEvent(name);
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

    /**
     * Asks its parent StateMachine for a named event stream.
     *
     * @param {String} name
     * @return {Event}
     */
    getParentEvent: function(name, scope) {
        var parent = this.parent;
        var getEvent = parent && parent.getEvent;
        return getEvent && parent.getEvent(name, true);
    },

    /**
     * Sets a mutable property on this State object.
     *
     * @param {String} name
     * @param {?} value
     */
    setProperty: function(name, value) {
        var propertyNames = this._props.transientProperties;
        if (Array.isArray(propertyNames) && propertyNames.indexOf(name) > -1) {
            var propertyValuesByName = this._propertyValuesByName || {};
            propertyValuesByName[name] = value;
            this._propertyValuesByName = propertyValuesByName;
        } else if (this.parent && typeof this.parent.setProperty === 'function') {
            this.parent.setProperty(name, value);
        } else {
            throw new Error("Can't set undeclared property: " + name);
        }
    },

    /**
     * Gets a mutable property from this State object.
     *
     * @param {String} name
     * @return {?} value
     */
    getProperty: function(name) {
        var propertyNames = this._props.transientProperties;
        if (Array.isArray(propertyNames) && propertyNames.indexOf(name) > -1) {
            var propertyValuesByName = this._propertyValuesByName;
            return propertyValuesByName && propertyValuesByName[name];
        } else if (this.parent && typeof this.parent.getProperty === 'function') {
            return this.parent.getProperty(name);
        } else {
            throw new Error("Can't get undeclared property: " + name);
        }
    },

    /**
     * Checks for a mutable property from this State object.
     *
     * @param {String} name
     * @return {Boolean}
     */
    hasProperty: function(name) {
        var propertyNames = this._props.transientProperties;
        if (Array.isArray(propertyNames) && propertyNames.indexOf(name) > -1) {
            return true;
        } else if (this.parent && typeof this.parent.getProperty === 'function') {
            return this.parent.hasProperty(name);
        } else {
            return false;
        }
    }

};

module.exports = State;
