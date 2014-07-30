var Rx = require('rx');
var StateMachine = require('./StateMachine');
var NOOP = function() {};

var fsm = new StateMachine({
    channels: ['event1','event2'],
    onEnter: function(fsm) {
        fsm.getChannel('event2').takeUntil(fsm.exits)
            .subscribe(function() {
                switch (fsm.currentStateName) {
                    case 'state1': fsm.transition('state2'); break;
                    case 'state2': fsm.transition('state3'); break;
                }
            })
    },
    startState: 'state1',
    states: {
        state1: {
            onEnter: function(state1) {
                state1.getChannel('event1')
                    .takeUntil(state1.exits)
                    .subscribe(function(event) {
                        console.log('deferring event');
                        state1.getChannel('event1').defer(event);
                    })
            }
        },
        state2: {
            onEnter: function(state2) {
                state2.getChannel('event1')
                    .takeUntil(state2.exits)
                    .subscribe(function() {
                        console.log('deferring event again');
                        state2.getChannel('event1').defer();
                    })
            }
        },
        state3: {
            onEnter: function(state3, fsm) {
                state3.getChannel('event1')
                    .takeUntil(state3.exits)
                    .subscribe(function() {
                        console.log('state 3');
                        fsm.transition('state4');
                    })
            }
        },
        state4: {
            onEnter: function() {
                console.log('state4')
            }
        },
        state5: {},
        state6: {}
    }
})

fsm.enter();
fsm.getChannel('event1').onNext('test')
fsm.getChannel('event1').onNext('test')
fsm.getChannel('event2').onNext('test')
fsm.getChannel('event2').onNext('test')
