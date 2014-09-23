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
        a: {
            afterEnter: output('-> a'),
            beforeExit: output('<- a')
        },
        b: {
            afterEnter: output('-> b'),
            beforeExit: output('<- b')
        },
        c: {
            afterEnter: output('-> c'),
            beforeExit: output('<- c')
        },
    }
});

abc.enter();

Rx.Observable.interval(1000)
    .subscribe(abc.getEvent('next'));
