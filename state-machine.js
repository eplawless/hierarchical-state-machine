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
    if (!('initialState' in this.props)) {
        throw new Error('StateMachineFactory requires initialState property');
    }
    if (!(this.props.initialState in this.props.states)) {
        throw new Error('StateMachineFactory\'s initial state "' + this.props.initialState + '" doesn\'t exist');
    }
}

StateMachineFactory.prototype = {
    create: function(extra) {
        return new StateMachine(this.props, extra);
    }
};

function StateMachine(props, extra) {
    this.props = props || {};
    ('allowSelfTransition' in this.props) || (this.props.allowSelfTransition = false);
    ('requireExplicitTransitions' in this.props) || (this.props.requireExplicitTransitions = false);
    ('states' in this.props) || (this.props.states = {});
    this.extra = extra || {};
    this.currentStateName = null;
    this._isTransitioning = false;
    this._queuedEnters = [];
    this.enter(props.initialState);
}

StateMachine.prototype = {
    enter: function(stateName) {
        var props = this.props;
        var extra = this.extra;
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
                !props.allowSelfTransition &&
                !tryToGet(lastState, 'allowTransitionTo', nextStateName);
            if (isSelfTransitionAndIsNotAllowed) continue;

            var isNotAllowed = props.requireExplicitTransitions && lastState &&
                !tryToGet(lastState, 'allowTransitionTo', nextStateName);
            if (isNotAllowed) continue;

            var canExit       = tryToGet(lastState, 'canExit');
            var canTransition = tryToGet(lastState, 'canTransitionTo', nextStateName);
            var canEnter      = tryToGet(nextState, 'canEnter');

            if (canExit       && !canExit.call(this, this)       ||
                canTransition && !canTransition.call(this, this) ||
                canEnter      && !canEnter.call(this, this))
            {
                continue;
            }

            var beforeExit = tryToGet(extra, lastStateName, 'beforeExit');
            var onExit     = tryToGet(lastState, 'onExit');
            var afterExit  = tryToGet(extra, lastStateName, 'afterExit');

            var beforeEnter = tryToGet(extra, nextStateName, 'beforeEnter');
            var onEnter     = tryToGet(nextState, 'onEnter');
            var afterEnter  = tryToGet(extra, nextStateName, 'afterEnter');

            var beforeTransition = tryToGet(extra, lastStateName, 'beforeTransitionTo', nextStateName);
            var onTransition     = tryToGet(lastState, 'onTransitionTo', nextStateName);
            var afterTransition  = tryToGet(extra, lastStateName, 'afterTransitionTo', nextStateName);

            tryToCall(beforeExit, this, this);
            tryToCall(onExit, this, this);
            tryToCall(afterExit, this, this);

            tryToCall(beforeTransition, this, this);
            tryToCall(onTransition, this, this);
            tryToCall(afterTransition, this, this);

            tryToCall(beforeEnter, this, this);
            this.currentStateName = nextStateName;
            tryToCall(onEnter, this, this);
            tryToCall(afterEnter, this, this);
        }
        this._isTransitioning = false;
    }
};

var PlayerFactory = new StateMachineFactory({
    initialState: 'stopped',
    states: {
        stopped: {
            onEnter: function() { console.log('stopped!') },
            onExit: function() { console.log('not stopped no more') }
        },
        playing: {
            onEnter: function() { console.log('playing') }
        }
    }
});

var player = PlayerFactory.create({
    stopped: {
        beforeEnter: function() { console.log('stopping'); },
        afterEnter: function() { console.log('stopped'); },
        beforeExit: function() { console.log('going to stop being stopped'); },
        beforeTransitionTo: {
            playing: function() { console.log('transition from stopped to playing'); }
        }
    },
    playing: {
        beforeEnter: function() { console.log('gonna start playing now'); },
        afterEnter: function() { console.log('started playing!'); }
    }
});


