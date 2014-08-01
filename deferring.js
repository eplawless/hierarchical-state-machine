var Rx = require('rx');
var StateMachineFactory = require('./StateMachineFactory');
var NOOP = function() {};

function justPrint(value) {
    return function() { console.log(value); }
}

// http://redboltz.wdfiles.com/local--files/deferred-events/fig11.png

var fsmFactory = new StateMachineFactory({
    channels: ['event1','event2'],
    startState: 'state1',
    states: {
        state1: { deferEvents: ['event1'], transitionOnEvents: { event2: 'state2' } },
        state2: { deferEvents: ['event1'], transitionOnEvents: { event2: 'state3' } },
        state3: { transitionOnEvents: { event1: 'state4' } },
        state4: { transitionOnEvents: { event1: 'state5' } },
        state5: { transitionOnEvents: { event1: 'state6' } },
        state6: {}
    }
});

var fsm = fsmFactory.create({
    states: {
        state1: { afterEnter: justPrint('state1') },
        state2: { afterEnter: justPrint('state2') },
        state3: { afterEnter: justPrint('state3') },
        state4: { afterEnter: justPrint('state4') },
        state5: { afterEnter: justPrint('state5') },
        state6: { afterEnter: justPrint('state6') }
    }
});

fsm.enter();
fsm.getChannel('event1').onNext('test')
fsm.getChannel('event1').onNext('test')
fsm.getChannel('event2').onNext('test')
fsm.getChannel('event1').onNext('test')
fsm.getChannel('event2').onNext('test')
fsm.exit();
