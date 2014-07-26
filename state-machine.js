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
    create: function(extra, parent) {
        var result = new StateMachine(this.props, extra);
        result.parent = parent;
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
        var beforeEnter = tryToGet(this, 'extra', 'beforeEnter');
        var onEnter = tryToGet(this, 'props', 'onEnter');
        var afterEnter = tryToGet(this, 'extra', 'afterEnter');
        tryToCall(beforeEnter, this, this);
        tryToCall(onEnter, this, this);
        tryToCall(afterEnter, this, this);
        this.transition(this.props.startState);
    },

    exit: function() {
        if (!this.entered) {
            return;
        }
        var currentStateName = this.currentStateName;
        if (currentStateName) {
            var beforeExitCurrentState = tryToGet(this, 'extra', currentStateName, 'beforeExit');
            var onExitCurrentState = tryToGet(this, 'props', 'states', currentStateName, 'onExit');
            var afterExitCurrentState = tryToGet(this, 'extra', currentStateName, 'afterExit');
            tryToCall(beforeExitCurrentState, this, this);
            tryToCall(onExitCurrentState, this, this);
            tryToCall(afterExitCurrentState, this, this);
            this.currentStateName = null;
        }
        var beforeExit = tryToGet(this, 'extra', 'beforeExit');
        var onExit = tryToGet(this, 'props', 'onExit');
        var afterExit = tryToGet(this, 'extra', 'afterExit');
        tryToCall(beforeExit, this, this);
        tryToCall(onExit, this, this);
        tryToCall(afterExit, this, this);
        this.entered = false;
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

            var beforeExit = tryToGet(extra, lastStateName, 'beforeExit');
            var onExit = tryToGet(lastState, 'onExit');
            var afterExit = tryToGet(extra, lastStateName, 'afterExit');

            var beforeTransition = tryToGet(extra, lastStateName, 'beforeTransitionTo', nextStateName);
            var onTransition = tryToGet(lastState, 'onTransitionTo', nextStateName);
            var afterTransition = tryToGet(extra, lastStateName, 'afterTransitionTo', nextStateName);

            var beforeEnter = tryToGet(extra, nextStateName, 'beforeEnter');
            var onEnter = tryToGet(nextState, 'onEnter');
            var afterEnter = tryToGet(extra, nextStateName, 'afterEnter');

            var lastStateNestedStateMachine = this._nestedStateMachines[lastStateName];
            if (lastStateNestedStateMachine) {
                lastStateNestedStateMachine.exit();
                delete this._nestedStateMachines[lastStateName];
            } else {
                tryToCall(beforeExit, this, this);
                tryToCall(onExit, this, this);
                tryToCall(afterExit, this, this);
            }

            tryToCall(beforeTransition, this, this);
            tryToCall(onTransition, this, this);
            tryToCall(afterTransition, this, this);

            this.currentStateName = nextStateName;

            var nextNestedStateMachineFactory = this._nestedStateMachineFactories[nextStateName];
            if (nextNestedStateMachineFactory) {
                var nextNestedStateMachineExtra = tryToGet(extra, nextStateName, 'states');
                var nextNestedStateMachine = nextNestedStateMachineFactory.create(nextNestedStateMachineExtra);
                this._nestedStateMachines[nextStateName] = nextNestedStateMachine;
                nextNestedStateMachine.enter();
            } else {
                tryToCall(beforeEnter, this, this);
                tryToCall(onEnter, this, this);
                tryToCall(afterEnter, this, this);
            }
        }
        this._isTransitioning = false;
    }
};

var PlayerFactory = new StateMachineFactory({
    startState: 'stopped',
    onEnter: function() { console.log('starting up player') },
    onExit: function() { console.log('shutting down player') },
    states: {
        stopped: {
            startState: 'idle',
            onEnter: function() { console.log('entering stopped state') },
            onExit: function() { console.log('leaving stopped state') },
            states: {
                idle: {
                    onEnter: function() { console.log('entering stopped.idle state') },
                    onExit: function() { console.log('leaving stopped.idle state') }
                }
            }
        },
        playing: {
            onEnter: function() { console.log('entering playing state') },
            onExit: function() { console.log('leaving playing state') }
        }
    }
});

var player = PlayerFactory.create({
    beforeEnter: function() { console.log('about to start up player') },
    afterExit: function() { console.log('player was just shut down') }
});

player.transition('playing')
player.exit();
player.exit();
player.enter();
