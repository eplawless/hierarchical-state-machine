var Rx = require('rx');
var StateMachine = require('./StateMachine');
var StateMachineFactory = require('./StateMachineFactory');
var NOOP = function() {};

var animatedStateMachineFactory = new StateMachineFactory({
    startStateName: 'start',
    requireExplicitTransitions: true,
    states: {
        start: {
            allowTransitionsTo: ['animating'],
            onEnter: function(startState) {
                var topLevelState = startState.parent;
                topLevelState.value = 0;
                topLevelState.interval = 1;
                topLevelState.timeout = 100;
            }
        },
        animating: {
            allowTransitionsTo: ['end'],
            onEnter: function(animatingState, topLevelState) {
                var topLevelState = animatingState.parent;
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
        end: {}
    }
});

var animatedStateMachine = animatedStateMachineFactory.create({
    beforeExit: function() { console.log('animation stopped') },
    states: {
        start: {
            afterEnter: function(startState) {
                console.log('entered')
                topLevelState = startState.parent;
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
            afterExit: function(animatingState) {
                var topLevelState = animatingState.parent;
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
        startStateName: 'inService',
        states: {
            inService: {
                onEnter: function(inServiceState, topLevelState) {
                    faultTriggers
                        .takeUntil(inServiceState.exits)
                        .subscribe(function() {
                            topLevelState.transition('outOfService')
                        });
                },
                startStateName: 'standby',
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
                startStateName: 'suspect',
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

/*
// Calculator example:
// http://upload.wikimedia.org/wikipedia/en/a/a6/UML_state_machine_Fig2b.png

function isOperator(key) {
    return /[+-/*]/.test(key);
}

function isDigitOrDot(key) {
    return /[0-9.]/.test(key);
}

var calculator = new StateMachine({
    startStateName: 'on',
    events: ['keyInput', 'clearInput'],
    allowSelfTransitions: true,
    states: {
        onEnter: function(calculator) {
            calculator.getEvent('clearInput')
                .takeUntil(calculator.exits)
                .subscribe(function() {
                    calculator.transition('on');
                })
        },
        on: {
            startStateName: 'operand1',
            requireExplicitTransitions: true,
            events: ['setOperator', 'setOperand1', 'setOperand2'],
            onEnter: function(onState) {
                onState.operand1Digits = [];
                onState.operand2Digits = [];
                onState.operator = null;

                onState.getEvent('setOperand1')
                    .takeUntil(onState.exits)
                    .subscribe(function(operand1) { onState.operand1Digits = operand1; })

                onState.getEvent('setOperand2')
                    .takeUntil(onState.exits)
                    .subscribe(function(operand2) { onState.operand2Digits = operand2; })

                onState.getEvent('setOperator')
                    .takeUntil(onState.exits)
                    .subscribe(function(operator) { onState.operator = operator; })
            },
            states: {
                operand1: {
                    allowTransitionsTo: ['operand2'],
                    onEnter: function(operand1State) {
                        operand1State.operator = null;
                        operand1State.digits = [];

                        keyInput
                            .takeUntil(operand1State.exits)
                            .subscribe(function(key) {
                                if (isDigitOrDot(key)) {
                                    operand1State.digits.push(key);
                                } else if (isOperator(key)) {
                                    operand1State.operator = key;
                                    onState.transition('operand2')
                                }
                            });
                    }
                },
                operand2: {
                    allowTransitionsTo: ['result'],
                    onEnter: function(operand2State, onState) {
                        keyInput
                            .takeUntil(operand2State.exits)
                            .subscribe(function(key) {
                                if (isDigitOrDot(key)) {
                                    onState.operand2Digits.push(key);
                                } else if (key === '=') {
                                    onState.transition('result');
                                }
                            });
                    }
                },
                result: {
                    allowTransitionsTo: ['operand1','operand2'],
                    onEnter: function(resultState, onState) {
                        var operand1 = parseFloat(onState.operand1Digits.join(''));
                        var operand2 = parseFloat(onState.operand2Digits.join(''));
                        var result;
                        switch (onState.operator) {
                            case '+': result = operand1 + operand2; break;
                            case '-': result = operand1 - operand2; break;
                            case '/': result = operand1 / operand2; break;
                            case '*': result = operand1 * operand2; break;
                            default: result = 'error';
                        }
                        console.log(result);
                        keyInput
                            .takeUntil(resultState.exits)
                            .subscribe(function(key) {
                                if (isDigitOrDot(key)) {
                                    onState.operand1Digits = [key];
                                    onState.operand2Digits = [];
                                    onState.transition('operand1');
                                } else if (isOperator(key)) {
                                    onState.operand1Digits = [result];
                                    onState.operand2Digits = [];
                                    onState.operator = key;
                                    onState.transition('operand2');
                                }
                            });
                    }
                }
            }
        }
    }
})

function input(string) {
    for (var idx in string) {
        keyInput.onNext(string[idx]);
    }
}

function clear() {
    clearInput.onNext();
}

calculator.enter();
input('7/2=*4=');
*/

