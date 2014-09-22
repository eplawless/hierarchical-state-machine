var StateMachine = require('../StateMachine');

function output(value) { return function() { console.log(value); } }

var abc = new StateMachine({
    start: 'a',
    states: ['a','b','c'],
    events: ['next'],
    transitions: [
        { event: 'next', from: 'a', to: 'b' },
        { event: 'next', from: 'b', to: 'c' },
        { event: 'next', from: 'c', to: 'a' },
    ],
});

abc.setBehavior({
    states: {
        a: { afterEnter: output('a') },
        b: { afterEnter: output('b') },
        c: { afterEnter: output('c') },
    }
})

abc.enter();
abc.fireEvent('next');
abc.fireEvent('next');
abc.fireEvent('next');
abc.exit();
