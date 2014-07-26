var Rx = require('rx');
var tryToGet = require('./tryToGet');
var tryToCall = require('./tryToCall');

function State(props, behavior, parent) {
    this._props = props || {};
    this._entered = false;
    this._behavior = behavior;
    this.parent = parent;
}

State.prototype = {
    get enters() {
        if (!this._enters) { this._enters = new Rx.Subject; }
        return this._enters;
    },
    get exits() {
        if (!this._exits) { this._exits = new Rx.Subject; }
        return this._exits;
    },
    update: function(behavior) {
        this._behavior = behavior;
    },
    enter: function() {
        if (!this.canBeEntered())
            return false;
        this.entered = true;
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, this.parent);
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
    }
};

function StateMachineFactory(props) {
    this._props = props || {};
    this._props.states = this._props.states || {};
    if (!('startState' in this._props)) {
        throw new Error('StateMachineFactory requires startState property');
    }
    if (!(this._props.startState in this._props.states)) {
        throw new Error('StateMachineFactory\'s initial state "' + this._props.startState + '" doesn\'t exist');
    }
}

StateMachineFactory.prototype = {
    create: function(behavior, parent) {
        var result = new StateMachine(this._props, behavior, parent);
        return result;
    }
};

function StateMachine(props, behavior, parent) {
    this.exit = this.exit.bind(this);
    this.enter = this.enter.bind(this);
    this.transition = this.transition.bind(this);
    this._props = props || {};
    this.parent = parent;
    ('allowSelfTransitions' in this._props) || (this._props.allowSelfTransitions = false);
    ('requireExplicitTransitions' in this._props) || (this._props.requireExplicitTransitions = false);
    ('states' in this._props) || (this._props.states = {});
    this._behavior = behavior || {};
    this._entered = false;
    this.currentStateName = null;
    this._nestedStateMachineFactories = this._createNestedStateMachineFactories(this._props.states);
    this._nestedStates = {};
    this._isTransitioning = false;
    this._queuedEnters = [];
}

StateMachine.prototype = {

    get enters() {
        if (!this._enters) { this._enters = new Rx.Subject; }
        return this._enters;
    },
    get exits() {
        if (!this._exits) { this._exits = new Rx.Subject; }
        return this._exits;
    },

    _createNestedStateMachineFactories: function(states) {
        var result = {};
        for (var stateName in states) {
            var state = states[stateName];
            var subStates = tryToGet(state, 'states');
            if (subStates && typeof subStates === 'object') {
                result[stateName] = new StateMachineFactory(state);
            }
        }
        return result;
    },

    enter: function() {
        if (this.currentStateName) {
            this.exit();
        }
        this._entered = true; // we set this flag here so we can transition more on the way in
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_behavior', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        this.transition(this._props.startState);
        tryToCall(tryToGet(this, '_behavior', 'afterEnter'), this, this, this.parent);
    },

    _enterNestedState: function(stateName, stateProps, stateBehavior) {
        this.currentStateName = stateName;
        var nestedStateMachineFactory = this._nestedStateMachineFactories[stateName];
        var nestedState = nestedStateMachineFactory
            ? nestedStateMachineFactory.create(stateBehavior, this)
            : new State(stateProps, stateBehavior, this);
        this._nestedStates[stateName] = nestedState;
        nestedState.enter();
    },

    exit: function() {
        if (!this._entered) {
            return;
        }
        this._entered = false; // we set this flag here so we can't transition on the way out
        tryToCall(tryToGet(this, '_behavior', 'beforeExit'), this, this, this.parent);
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, '_props', 'states', this.currentStateName),
            tryToGet(this, '_behavior', 'states', this.currentStateName)
        );
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
    },

    _runTransitionHandlers: function(lastStateName, nextStateName) {
        var beforeTransition = tryToGet(this._behavior, 'states', lastStateName, 'beforeTransitionTo', nextStateName)
        var onTransition = tryToGet(this._states, lastStateName, 'onTransitionTo', nextStateName)
        var beforeEntering = tryToGet(this._behavior, 'states', lastStateName, 'beforeEnteringInto', nextStateName)
        tryToCall(beforeTransition, this, this, this.parent);
        tryToCall(onTransition, this, this, this.parent);
        tryToCall(beforeEntering, this, this, this.parent);
    },

    transition: function(stateName) {
        if (!this._entered) {
            return;
        }
        var props = this._props;
        var behavior = this._behavior;
        if (this._isTransitioning) {
            this._queuedEnters.push(stateName);
            return;
        }

        this._isTransitioning = true;

        this._queuedEnters.push(stateName);
        while (this._queuedEnters.length) {
            var lastStateName = this.currentStateName;
            var nextStateName = this._queuedEnters.shift();
            var lastState = props.states[lastStateName];
            var nextState = props.states[nextStateName];
            if (!nextState) continue;

            var isSelfTransitionAndIsNotAllowed = nextStateName === lastStateName &&
                !props.allowSelfTransitions &&
                !tryToGet(lastState, 'allowTransitionsTo', nextStateName);
            if (isSelfTransitionAndIsNotAllowed) continue;

            var isNotAllowed = props.requireExplicitTransitions && lastState &&
                !tryToGet(lastState, 'allowTransitionsTo', nextStateName);
            if (isNotAllowed) continue;

            var canExit = tryToGet(lastState, 'canExit');
            var canTransition = tryToGet(lastState, 'canTransitionTo', nextStateName);
            var canEnter = tryToGet(nextState, 'canEnter');

            if (canExit && !canExit.call(this, this)       ||
                canTransition && !canTransition.call(this, this) ||
                canEnter && !canEnter.call(this, this))
            {
                continue;
            }

            this._exitNestedState(
                lastStateName,
                lastState,
                tryToGet(behavior, 'states', lastStateName)
            );

            this._runTransitionHandlers(lastStateName, nextStateName);

            this._enterNestedState(
                nextStateName,
                nextState,
                tryToGet(behavior, 'states', nextStateName)
            );
        }
        this._isTransitioning = false;
    }
};

module.exports = StateMachineFactory;

