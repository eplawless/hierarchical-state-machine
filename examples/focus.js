var StateMachine = require('../StateMachine');

function print() { return console.log.apply(console, arguments); }
function justPrint(value) { return function() { console.log(value); } }

var focus = new StateMachine({
    states: ['focused', 'blurred'],
    events: ['focus', 'blur', 'spin'],
    startStateName: 'blurred',
    transitions: [
        { event: 'focus', to: 'focused' },
        { event: 'blur', to: 'blurred' },
    ],
});

focus.enters.subscribe(justPrint('enter!'))
focus.transitions.subscribe(print);
focus.exits.subscribe(justPrint('exit!'))

focus.enter();
focus.fireEvent('blur');
focus.fireEvent('focus');
focus.fireEvent('focus');
focus.fireEvent('blur');
focus.transition('focused');
focus.exit();
