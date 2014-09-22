var StateMachine = require('../StateMachine');

function print() { return console.log.apply(console, arguments); }
function justPrint(value) { return function() { console.log(value); } }

var focus = new StateMachine({
    start: 'blurred',
    states: ['focused', 'blurred'],
    events: ['focus', 'blur', 'spin'],
    transitions: [
        { event: 'focus', to: 'focused' },
        { event: 'blur', to: 'blurred' },
    ],
}, {
    states: {
        focused: {
            afterEnter: function(state, data) {
                console.log(data);
                state.fireEvent('blur', data);
            }
        },
        blurred: {
            afterEnter: function(state, data) {
                console.log(data);
            }
        }
    }
});

focus.transitions.subscribe(print)

focus.enter();
focus.fireEvent('focus', { x: 1 });
focus.exit();
