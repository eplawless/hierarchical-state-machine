var StateMachine = require('../StateMachine');

function output(value) {
    return function(state, event) {
        console.log(value);
        event && event.propagate();
    }
}

var focusFsm = new StateMachine({
    start: 'blurred',
    states: ['focused', 'blurred'],
    events: ['focus', 'blur'],
    transitions: [
        { event: 'focus', to: 'focused' },
        { event: 'blur', to: 'blurred' },
    ],
});

focusFsm.setBehavior({
    states: {
        focused: { afterEnter: output('focused!') },
        blurred: { afterEnter: output('blurred!') },
    }
});

focusFsm.enter();
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('blur');
focusFsm.exit();

