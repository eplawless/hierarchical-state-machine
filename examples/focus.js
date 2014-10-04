var StateMachine = require('../StateMachine');

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
        focused: { afterEnter: printEnteringState, beforeExit: printLeavingState },
        blurred: { afterEnter: printEnteringState, beforeExit: printLeavingState },
    }
});

function printLeavingState(state, context) {
    console.log('leaving', context.from);
}

function printEnteringState(state, context) {
    console.log('entering', context.to);
}

focusFsm.enter();
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('blur');
focusFsm.exit();

