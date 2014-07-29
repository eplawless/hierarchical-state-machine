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
                    .where(function() { return Math.random() < 0.01 })
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

console.log('The Incredible Machine!')
console.log('Press "q" to exit the FSM')
console.log('Press "e" to enter the FSM')
console.log('Press "Ctrl-c" to exit the program')
console.log('Press any other key to trigger a button press')
console.log('')

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
