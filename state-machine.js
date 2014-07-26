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
    this.props = props || {};
    this.props.states = this.props.states || {};
    if (!('startState' in this.props)) {
        throw new Error('StateMachineFactory requires startState property');
    }
    if (!(this.props.startState in this.props.states)) {
        throw new Error('StateMachineFactory\'s initial state "' + this.props.startState + '" doesn\'t exist');
    }
}

StateMachineFactory.prototype = {
    create: function(extra) {
        var result = new StateMachine(this.props, extra);
        return result;
    }
};

function StateMachine(props, extra) {
    this.props = props || {};
    ('allowSelfTransition' in this.props) || (this.props.allowSelfTransition = false);
    ('requireExplicitTransitions' in this.props) || (this.props.requireExplicitTransitions = false);
    ('states' in this.props) || (this.props.states = {});
    this.extra = extra || {};
    this.entered = false;
    this.currentStateName = null;
    this._nestedStateMachineFactories = this._createNestedStateMachineFactories(this.props.states);
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
        this.entered = true;
        this._invokeEnterHandlers(tryToGet(this, 'props'), tryToGet(this, 'extra'));
        this.transition(this.props.startState);
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
            var nestedStateMachine = nestedStateMachineFactory.create(stateExtra);
            this._nestedStateMachines[stateName] = nestedStateMachine;
            nestedStateMachine.enter();
        } else {
            this._invokeEnterHandlers(stateProps, stateExtra);
        }
    },

    exit: function() {
        if (!this.entered) {
            return;
        }
        this._exitNestedState(
            this.currentStateName,
            tryToGet(this, 'props', 'states', this.currentStateName),
            tryToGet(this, 'extra', 'states', this.currentStateName)
        );
        this._invokeExitHandlers(
            tryToGet(this, 'props'),
            tryToGet(this, 'extra')
        );
        this.entered = false;
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
        var props = this.props;
        var extra = this.extra;
        if (this._isTransitioning) {
            this._queuedEnters.push(stateName);
            return;
        }

        this._isTransitioning = true;
        if (!this.entered) {
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
                !props.allowSelfTransition &&
                !tryToGet(lastState, 'allowTransitionTo', nextStateName);
            if (isSelfTransitionAndIsNotAllowed) continue;

            var isNotAllowed = props.requireExplicitTransitions && lastState &&
                !tryToGet(lastState, 'allowTransitionTo', nextStateName);
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
            var afterTransition = tryToGet(extra, 'states', lastStateName, 'afterTransitionTo', nextStateName);
            tryToCall(beforeTransition, this, this);
            tryToCall(onTransition, this, this);
            tryToCall(afterTransition, this, this);

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

var playerFactory = new StateMachineFactory({
    startState: 'stopped',
    onEnter: function() { console.log('starting up player') },
    onExit: function() { console.log('shutting down player') },
    states: {
        stopped: {
            startState: 'idle',
            onEnter: function() { console.log(' entering stopped state') },
            onExit: function() { console.log(' leaving stopped state') },
            states: {
                idle: {
                    onEnter: function() {
                        console.log('  entering stopped.idle state')
                        this.transition('error');
                    },
                    onExit: function() { console.log('  leaving stopped.idle state') },
                    onTransitionTo: {
                        error: function() { console.log('  moving from idle to error state!') }
                    }
                },
                error: {
                    onEnter: function() { console.log('  entering stopped.error state') },
                    onExit: function() { console.log('  exiting stopped.error state') }
                }
            }
        },
        playing: {
            onEnter: function() { console.log(' entering playing state') },
            onExit: function() { console.log(' leaving playing state') }
        }
    }
});

var player = playerFactory.create({
    beforeEnter: function() { console.log('about to start up player') },
    afterExit: function() { console.log('player was just shut down') },
    states: {
        stopped: {
            beforeEnter: function() { console.log(' before entering stopped state') },
            afterEnter: function() { console.log(' after entering stopped state') },
            states: {
                idle: {
                    beforeExit: function() { console.log('  before exiting idle state') },
                    afterTransitionTo: {
                        error: function() { console.log('  after transition bit to idle') }
                    }
                }
            }
        }
    }
});

player.enter()
player.exit()

