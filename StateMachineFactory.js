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
    create: function(extra, parent) {
        var result = new StateMachine(this._props, extra, parent);
        return result;
    }
};

function StateMachine(props, extra, parent) {
    this.exit = this.exit.bind(this);
    this.enter = this.enter.bind(this);
    this.transition = this.transition.bind(this);
    this._props = props || {};
    this.parent = parent;
    ('allowSelfTransitions' in this._props) || (this._props.allowSelfTransitions = false);
    ('requireExplicitTransitions' in this._props) || (this._props.requireExplicitTransitions = false);
    ('states' in this._props) || (this._props.states = {});
    this._extra = extra || {};
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
        this._entered = true;
        this._enters && this._enters.onNext();
        tryToCall(tryToGet(this, '_extra', 'beforeEnter'), this, this, this.parent);
        tryToCall(tryToGet(this, '_props', 'onEnter'), this, this, this.parent);
        this.transition(this._props.startState);
        tryToCall(tryToGet(this, '_extra', 'afterEnter'), this, this, this.parent);
    },

    _enterNestedState: function(stateName, stateProps, stateExtra) {
        this.currentStateName = stateName;
        var nestedStateMachineFactory = this._nestedStateMachineFactories[stateName];
        var nestedState = nestedStateMachineFactory
            ? nestedStateMachineFactory.create(stateExtra, this)
            : new State(stateProps, stateExtra, this);
        this._nestedStates[stateName] = nestedState;
        nestedState.enter();
    },

    exit: function() {
        if (!this._entered) {
            return;
        }
        tryToCall(tryToGet(this, '_extra', 'beforeExit'), this, this, this.parent);
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, '_props', 'states', this.currentStateName),
            tryToGet(this, '_extra', 'states', this.currentStateName)
        );
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this, this.parent);
        tryToCall(tryToGet(this, '_extra', 'afterExit'), this, this, this.parent);
        this._entered = false;
        this._exits && this._exits.onNext();
    },

    _exitNestedState: function(stateName, stateProps, stateExtra) {
        var nestedState = this._nestedStates[stateName];
        if (nestedState) {
            nestedState.exit();
            delete this._nestedStates[stateName];
        }
        this.currentStateName = null;
    },

    transition: function(stateName) {
        var props = this._props;
        var extra = this._extra;
        if (this._isTransitioning) {
            this._queuedEnters.push(stateName);
            return;
        }

        this._isTransitioning = true;
        if (!this._entered) {
            this.enter();
        }

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

            var beforeTransition = tryToGet(extra, 'states', lastStateName, 'beforeTransitionTo', nextStateName)
            var onTransition = tryToGet(lastState, 'onTransitionTo', nextStateName)
            var beforeEntering = tryToGet(extra, 'states', lastStateName, 'beforeEnteringInto', nextStateName)

            this._exitNestedState(
                lastStateName,
                lastState,
                tryToGet(extra, 'states', lastStateName)
            );

            tryToCall(beforeTransition, this, this);
            tryToCall(onTransition, this, this);
            tryToCall(beforeEntering, this, this);

            this._enterNestedState(
                nextStateName,
                nextState,
                tryToGet(extra, 'states', nextStateName)
            );
        }
        this._isTransitioning = false;
    }
};

module.exports = StateMachineFactory;

