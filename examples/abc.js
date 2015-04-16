/*global console*/
/*eslint-disable no-console*/

var StateMachine = require('../StateMachine');
var Rx = require('rx');

var abc = new StateMachine({
    start: 'a',
    states: ['a', 'b', 'c'],
    inputEvents: ['next'],
    transitions: [
        { event: 'next', from: 'a', to: 'b' },
        { event: 'next', from: 'b', to: 'c' },
        { event: 'next', from: 'c', to: 'a' }
    ]
});

abc.transitions
    .takeUntil(abc.exits)
    .subscribe(function(data) {
        if (data && data.from) {
            console.log('exiting', data.from);
        }
        if (data && data.to) {
            console.log('entering', data.to);
        }
    });

Rx.Observable.interval(1000)
    .subscribe(function() {
        abc.fireEvent('next');
    });

abc.enter();

