var Rx = require('rx');
var StateMachineFactory = require('./StateMachineFactory');
var NOOP = function() {};

var animatedStateMachineFactory = new StateMachineFactory({
    startState: 'start',
    requireExplicitTransitions: true,
    states: {
        start: {
            allowTransitionsTo: ['animating'],
            onEnter: function(startState, topLevelState) {
                topLevelState.value = 0;
                topLevelState.interval = 1;
                topLevelState.timeout = 100;
            }
        },
        animating: {
            allowTransitionsTo: ['end'],
            onEnter: function(animatingState, topLevelState) {
                var interval = Rx.Observable.interval(topLevelState.interval);
                var timer = Rx.Observable.timer(topLevelState.timeout);
                var transitionToEnd = topLevelState.transition.bind(topLevelState, 'end');
                interval
                    .takeUntil(timer)
                    .takeUntil(animatingState.exits)
                    .doAction(function() { ++topLevelState.value; })
                    .subscribe(NOOP, NOOP, transitionToEnd);
            },
        },
        end: {
        }
    }
});

var animatedStateMachine = animatedStateMachineFactory.create({
    beforeExit: function() { console.log('animation stopped') },
    states: {
        start: {
            afterEnter: function(startState, topLevelState) {
                console.log('entered')
                topLevelState.value = 30;
                topLevelState.timeout = 700;
            },
            beforeTransitionTo: {
                animating: function(topLevelState) {
                    console.log('about to start animating with value', topLevelState.value)
                }
            }
        },
        animating: {
            afterExit: function(animatingState, topLevelState) {
                console.log('finished animating with value', topLevelState.value)
            }
        }
    }
});

animatedStateMachine.enter();
animatedStateMachine.transition('animating');
setTimeout(function() {
    animatedStateMachine.exit();
}, 340)

// http://www.eventhelix.com/realtimemantra/images/Hierarchical_state_transition_diagram.gif

/*
function getFsmFactory(switchovers, faultTriggers, diagnostics, operatorInService) {
    return new StateMachineFactory({
        startState: 'inService',
        states: {
            inService: {
                onEnter: function(inServiceState, topLevelState) {
                    faultTriggers
                        .takeUntil(inServiceState.exits)
                        .subscribe(function() {
                            topLevelState.transition('outOfService')
                        });
                },
                startState: 'standby',
                states: {
                    standby: {
                        onEnter: function(standbyState, inServiceState) {
                            switchovers
                                .takeUntil(standbyState.exits)
                                .subscribe(function() {
                                    inServiceState.transition('active')
                                });
                        },
                    },
                    active: {
                        onEnter: function(activeState, inServiceState) {
                            switchovers
                                .takeUntil(activeState.exits)
                                .subscribe(function() {
                                    inServiceState.transition('standby')
                                });
                        }
                    }
                }
            },
            outOfService: {
                startState: 'suspect',
                states: {
                    suspect: {
                        onEnter: function(suspectState, outOfServiceState) {
                            var topLevelState = outOfServiceState.parent;
                            diagnostics
                                .takeUntil(suspectState.exits)
                                .subscribe(function(everythingIsFine) {
                                    everythingIsFine
                                        ? topLevelState.transition('inService')
                                        : outOfServiceState.transition('failed');
                                });
                        },
                    },
                    failed: {
                        onEnter: function(failedState, outOfServiceState) {
                            operatorInService
                                .takeUntil(failedState.exits)
                                .where(function(isTrue) { return isTrue; })
                                .subscribe(function() {
                                    outOfServiceState.transition('suspect')
                                })
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
                active: { beforeEnter: function() { console.log(' switched to active') } },
                standby: { beforeEnter: function() { console.log(' switched to standby') } }
            }
        },
        outOfService: {
            beforeEnter: function() { console.log('entered out of service') },
            afterExit: function() { console.log('exited out of service') },
            states: {
                suspect: {
                    beforeEnter: function() {
                        console.log(' entered suspect');
                        console.log(' running diagnostics...');
                    }
                },
                failed: { beforeEnter: function() { console.log(' entered failed') } }
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
*/

