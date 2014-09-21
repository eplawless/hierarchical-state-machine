var NOOP = function() {};
var Rx = require('rx');
var StateMachine = require('./StateMachine');

function getPbvsForSetFocused(isFocused) {
    return [
        { path: ['focused'], value: isFocused },
        { path: ['opacity'], value: isFocused ? 1 : 0.8 },
    ]
}

function print() {
    return console.log.apply(console, arguments);
}

var focusFsm = new StateMachine({
    startStateName: 'blurred',
    events: ['pbvs', 'toggles'],
    onEnter: function(focusState) {
        focusState.getEvent('toggles')
            .takeUntil(focusState.exits)
            .subscribe(function() {
                var isFocused = (focusState.currentStateName === 'focused');
                focusState.transition(isFocused ? 'blurred' : 'focused');
            });
    },
    states: {
        focused: {
            onEnter: function(focusedState) {
                focusedState.getEvent('pbvs')
                    .onNext(getPbvsForSetFocused(true));
            }
        },
        blurred: {
            onEnter: function(blurredState) {
                blurredState.getEvent('pbvs')
                    .onNext(getPbvsForSetFocused(false));
            }
        }
    }
});

focusFsm.getEvent('pbvs').subscribe(print);

var stdin = process.stdin;
stdin.setRawMode( true );
stdin.resume();
stdin.setEncoding( 'utf8' );
stdin.on('data', function(key) {
    if (key === '\u0003') process.exit();
    else focusFsm.getEvent('toggles').onNext();
});

focusFsm.enter();

