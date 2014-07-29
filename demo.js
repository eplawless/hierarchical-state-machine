var NOOP = function() {};
var Rx = require('rx');
var StateMachineFactory = require('./StateMachineFactory');

var fsmFactory = new StateMachineFactory({
    startState: 'notRunning',
    channels: ['buttonPresses', 'runCommands', 'circuitBreakerExplosions'],
    onEnter: function(fsm) {
        fsm.getChannel('runCommands')
            .takeUntil(fsm.exits)
            .subscribe(function() { fsm.transition('running'); });

        fsm.getChannel('circuitBreakerExplosions')
            .takeUntil(fsm.exits)
            .subscribe(function() { fsm.transition('notRunning'); });
    },
    states: {
        notRunning: {
            onEnter: function(notRunning) {
                notRunning.getChannel('buttonPresses')
                    .takeUntil(notRunning.exits)
                    .subscribe(notRunning.getChannel('runCommands'));
            }
        },
        running: {
            onEnter: function(running) {
                Rx.Observable.interval(100)
                    .takeUntil(running.exits)
                    .select(function() { return Math.random(); })
                    .where(function(value) { return value < 0.01 })
                    .subscribe(running.getChannel('circuitBreakerExplosions'));
            }
        }
    }
});

var fsm = fsmFactory.create({
    beforeEnter: function(fsm) {
        console.log('entering fsm');
        fsm.getChannel('buttonPresses')
            .takeUntil(fsm.exits)
            .subscribe(function() { console.log('button pressed!') });

        fsm.getChannel('runCommands')
            .takeUntil(fsm.exits)
            .subscribe(function() { console.log('running!') });

        fsm.getChannel('circuitBreakerExplosions')
            .takeUntil(fsm.exits)
            .subscribe(function() { console.log('circuit breaker exploded!') });
    },
    beforeExit: function() { console.log('exiting fsm'); },
    states: {
        notRunning: {
            beforeEnter: function() { console.log('entering off state'); },
            beforeExit: function() { console.log('exiting off state'); },
        },
        running: {
            beforeEnter: function() { console.log('entering on state'); },
            beforeExit: function() { console.log('exiting on state'); },
        }
    }
});

fsm.enter();

var stdin = process.stdin;
stdin.setRawMode( true );
stdin.resume();
stdin.setEncoding( 'utf8' );
stdin.on('data', function(key) {
    if (key === '\u0003') process.exit();
    else if (key === 'q') fsm.exit();
    else if (key === 'e') fsm.enter();
    else fsm.getChannel('buttonPresses').onNext();
});
