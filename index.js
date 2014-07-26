var Rx = require('rx');
var StateMachineFactory = require('./StateMachineFactory');
var NOOP = function() {};

/*

var animatedStateMachineFactory = new StateMachineFactory({
    startState: 'start',
    requireExplicitTransitions: true,
    states: {
        start: {
            allowTransitionsTo: { animating: true },
            onEnter: function() {
                this.value = 0;
                this.interval = 1;
                this.timeout = 100;
            }
        },
        animating: {
            allowTransitionsTo: { end: true },
            onEnter: function() {
                var interval = Rx.Observable.interval(this.interval);
                var timer = Rx.Observable.timer(this.timeout);
                var transitionToEnd = this.transition.bind(this, 'end');
                this.animationDisposable =
                    interval.takeUntil(timer)
                        .doAction(function() { ++this.value; }.bind(this))
                        .subscribe(NOOP, NOOP, transitionToEnd);
            },
            onExit: function() {
                this.animationDisposable.dispose();
                delete this.animationDisposable;
            }
        },
        end: {}
    }
});

var animatedStateMachine = animatedStateMachineFactory.create({
    beforeExit: function() { console.log('animation stopped') },
    states: {
        start: {
            afterEnter: function() {
                this.value = 30;
                this.timeout = 700;
            },
            beforeTransitionTo: {
                animating: function() { console.log('about to start animating with value', this.value) }
            }
        },
        animating: {
            afterExit: function() { console.log('finished animating with value', this.value) }
        }
    }
});

animatedStateMachine.transition('animating');
setTimeout(function() {
    animatedStateMachine.exit();
}, 340)

*/

// http://www.eventhelix.com/realtimemantra/images/Hierarchical_state_transition_diagram.gif

function getFsmFactory(switchovers, faultTriggers, diagnostics, operatorInService) {
    return new StateMachineFactory({
        startState: 'inService',
        states: {
            inService: {
                onEnter: function() {
                    var parent = this.parent;
                    var disableService = parent.transition.bind(parent, 'outOfService');
                    this.faultTriggersSubscription = faultTriggers.subscribe(disableService);
                },
                onExit: function() {
                    this.faultTriggersSubscription.dispose();
                    delete this.faultTriggersSubscription;
                },
                startState: 'standby',
                states: {
                    standby: {
                        onEnter: function() {
                            var activate = this.transition.bind(this, 'active');
                            this.switchoversSubscription = switchovers.subscribe(activate);
                        },
                        onExit: function() {
                            this.switchoversSubscription.dispose();
                            delete this.switchoversSubscription;
                        }
                    },
                    active: {
                        onEnter: function() {
                            var deactivate = this.transition.bind(this, 'standby');
                            this.switchoversSubscription = switchovers.subscribe(deactivate);
                        },
                        onExit: function() {
                            this.switchoversSubscription.dispose();
                            delete this.switchoversSubscription;
                        }
                    }
                }
            },
            outOfService: {
                startState: 'suspect',
                states: {
                    suspect: {
                        onEnter: function() {
                            var self = this;
                            var parent = this.parent;
                            console.log('running diagnostics...')
                            this.diagnosticsSubscription =
                                diagnostics
                                    .doAction(function(everythingIsFine) {
                                        everythingIsFine
                                            ? parent.transition('inService')
                                            : self.transition('failed');
                                    })
                                    .subscribe(NOOP);
                        },
                        onExit: function() {
                            this.diagnosticsSubscription.dispose();
                            delete this.diagnosticsSubscription;
                        }
                    },
                    failed: {
                        onEnter: function() {
                            var checkDiagnosticsAgain = this.transition.bind(this, 'suspect');
                            this.operatorInServiceSubscription =
                                operatorInService
                                    .where(function(isTrue) { return isTrue; })
                                    .subscribe(checkDiagnosticsAgain)
                        },
                        onExit: function() {
                            this.operatorInServiceSubscription.dispose();
                            delete this.operatorInServiceSubscription;
                        }
                    }
                }
            }
        }
    });
}


var switchovers = new Rx.Subject;
var faultTriggers = new Rx.Subject;
var diagnostics = new Rx.BehaviorSubject(false);
var operatorInService = new Rx.BehaviorSubject(false);

var fsmFactory = getFsmFactory(switchovers, faultTriggers, diagnostics.delay(800), operatorInService);

var fsm = fsmFactory.create({
    states: {
        inService: {
            beforeEnter: function() { console.log('entered in service') },
            afterExit: function() { console.log('exited in service') },
            states: {
                active: { beforeEnter: function() { console.log('switched to active') } },
                standby: { beforeEnter: function() { console.log('switched to standby') } }
            }
        },
        outOfService: {
            beforeEnter: function() { console.log('entered out of service') },
            afterExit: function() { console.log('exited out of service') },
            states: {
                suspect: { beforeEnter: function() { console.log('entered suspect') } },
                failed: { beforeEnter: function() { console.log('entered failed') } }
            }
        }
    }
});

fsm.enter();
switchovers.onNext();
switchovers.onNext();
switchovers.onNext();
faultTriggers.onNext();
operatorInService.onNext(true);
diagnostics.onNext(true);
