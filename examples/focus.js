var StateMachine = require('../StateMachine');

function output(value) { return function() { console.log(value); } }

var focus = new StateMachine({
    start: 'blurred',
    states: ['focused', 'blurred'],
    events: ['focus', 'blur'],
    transitions: [
        { event: 'focus', to: 'focused' },
        { event: 'blur', to: 'blurred' },
    ],
});

focus.setBehavior({
    states: {
        focused: { afterEnter: output('focused') },
        blurred: { afterEnter: output('blurred') },
    }
});

focus.enter();
focus.fireEvent('focus');
focus.fireEvent('blur');
focus.exit();
