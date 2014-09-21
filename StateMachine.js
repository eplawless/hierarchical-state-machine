var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');
var Event = require('./Event');
var State = require('./State');

function StateMachine(props, behavior, parent) {
    this.exit = this.exit.bind(this);
    this.enter = this.enter.bind(this);
    this.transition = this.transition.bind(this);
    this._props = (props && typeof props === 'object') ? props : {};
    this._props.states = (this._props.states && typeof this._props.states === 'object') ? this._props.states : {};
    if (!('startStateName' in this._props)) {
        throw new Error('StateMachine requires startStateName property');
    }
    if (!(this._props.startStateName in this._props.states)) {
        throw new Error('StateMachine\'s initial state "' + this._props.startStateName + '" doesn\'t exist');
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
    this._events = this._createEvents(this._props);
    this._isTransitioning = false;
    this._queuedEnters = [];
    this._hasQueuedExit = false;
}

StateMachine.prototype = {

    currentStateName: null,

    get enters() {
        if (!this._enters) { this._enters = new Event; }
        return this._enters;
    },
    get exits() {
        if (!this._exits) { this._exits = new Event; }
        return this._exits;
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

    getParentEvent: function(name) {
        var parent = this.parent;
        return tryToCall(tryToGet(parent, 'getEvent'), parent, name);
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

    _listenForEventTransitions: function() {
        var transitionOnEvents = tryToGet(this, '_props', 'transitionOnEvents');
        for (var event in transitionOnEvents) {
            this.getEvent(event)
                .takeUntil(this.exits)
                .subscribe(this.transition.bind(this, transitionOnEvents[event]));
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
        if (this._queuedEnters.length) { // allow before/on/afterEnter to transition us first
            this.transition();
        } else {
            this.transition(this._props.startStateName);
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
