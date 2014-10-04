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
        focused: {
            afterEnter: printEntering,
            beforeExit: printLeaving
        },
        blurred: {
            afterEnter: printEntering,
            beforeExit: printLeaving
        },
    }
});

/**
 * @param {State} state
 * @param {TransitionInfo} context
 */
function printLeaving(state, context) {
    console.log('leaving', context.from);
}

/**
 * @param {State} state
 * @param {TransitionInfo} context
 */
function printEntering(state, context) {
    console.log('entering', context.to);
}

focusFsm.enter();
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('focus');
focusFsm.fireEvent('blur');
focusFsm.exit();

