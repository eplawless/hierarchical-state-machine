var StateMachine = require('../StateMachine');
var Rx = require('rx');

function printData(_, data) { console.log(data); }
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
        a: { afterEnter: output('entering a'), beforeExit: output('exiting a') },
        b: { afterEnter: output('entering b'), beforeExit: output('exiting b') },
        c: { afterEnter: output('entering c'), beforeExit: output('exiting c') },
    }
});

abc.enter();

Rx.Observable.interval(1000)
    .subscribe(function() {
        abc.fireEvent('next');
    });
