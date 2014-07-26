function tryToGet() {
    var obj = arguments[0];
    for (var idx = 1; idx < arguments.length; ++idx) {
        obj = obj ? obj[arguments[idx]] : undefined;
    }
    return obj;
}

function tryToCall(method, scope) {
    if (typeof method === 'function') {
        var args = Array.prototype.slice.call(arguments, 2);
        method.apply(scope, args);
    }
}

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
    this._nestedStateMachines = {};
    this._isTransitioning = false;
    this._queuedEnters = [];
}

StateMachine.prototype = {

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
        this._invokeEnterHandlers(tryToGet(this, '_props'), tryToGet(this, '_extra'));
        this.transition(this._props.startState);
    },

    _invokeEnterHandlers: function(props, extra) {
        var beforeEnter = tryToGet(extra, 'beforeEnter');
        var onEnter = tryToGet(props, 'onEnter');
        var afterEnter = tryToGet(extra, 'afterEnter');
        tryToCall(beforeEnter, this, this);
        tryToCall(onEnter, this, this);
        tryToCall(afterEnter, this, this);
    },

    _enterNestedState: function(stateName, stateProps, stateExtra) {
        var nestedStateMachineFactory = this._nestedStateMachineFactories[stateName];
        if (nestedStateMachineFactory) {
            var nestedStateMachine = nestedStateMachineFactory.create(stateExtra, this);
            this._nestedStateMachines[stateName] = nestedStateMachine;
            nestedStateMachine.enter();
        } else {
            this._invokeEnterHandlers(stateProps, stateExtra);
        }
    },

    exit: function() {
        if (!this._entered) {
            return;
        }
        tryToCall(tryToGet(this, '_extra', 'beforeExit'), this, this);
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, '_props', 'states', this.currentStateName),
            tryToGet(this, '_extra', 'states', this.currentStateName)
        );
        tryToCall(tryToGet(this, '_props', 'onExit'), this, this);
        tryToCall(tryToGet(this, '_extra', 'afterExit'), this, this);
        this._entered = false;
    },

    _invokeExitHandlers: function(props, extra) {
        var beforeExit = tryToGet(extra, 'beforeExit');
        var onExit = tryToGet(props, 'onExit');
        var afterExit = tryToGet(extra, 'afterExit');
        tryToCall(beforeExit, this, this);
        tryToCall(onExit, this, this);
        tryToCall(afterExit, this, this);
    },

    _exitNestedState: function(stateName, stateProps, stateExtra) {
        var nestedStateMachine = this._nestedStateMachines[stateName];
        if (nestedStateMachine) {
            nestedStateMachine.exit();
            delete this._nestedStateMachines[stateName];
        } else {
            this._invokeExitHandlers(stateProps, stateExtra);
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

            this._exitNestedState(
                lastStateName,
                lastState,
                tryToGet(extra, 'states', lastStateName)
            );

            var beforeTransition = tryToGet(extra, 'states', lastStateName, 'beforeTransitionTo', nextStateName);
            var onTransition = tryToGet(lastState, 'onTransitionTo', nextStateName);
            var beforeEntering = tryToGet(extra, 'states', lastStateName, 'beforeEnteringInto', nextStateName);
            tryToCall(beforeTransition, this, this);
            tryToCall(onTransition, this, this);
            tryToCall(beforeEntering, this, this);

            this.currentStateName = nextStateName;

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

