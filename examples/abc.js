var StateMachine = require('../StateMachine');

function justPrint(value) {
    return function print() { console.log(value); }
}

var abc = new StateMachine({
    events: ['1','2','3'],
    startStateName: 'a',
    transitionOnEvents: {
        '1': 'a',
        '2': 'b',
        '3': 'c'
    },
    states: {
        a: { onEnter: justPrint('a') },
        b: { onEnter: justPrint('b') },
        c: { onEnter: justPrint('c') }
    }
});

abc.enter();
abc.getEvent('3').onNext()
abc.getEvent('1').onNext()
abc.getEvent('2').onNext()
abc.exit();
