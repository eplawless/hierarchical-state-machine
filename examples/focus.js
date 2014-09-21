var StateMachine = require('../StateMachine');

function blur() { console.log('blurring!'); }
function focus() { console.log('focusing!'); }

var focus = new StateMachine({
    events: ['focus', 'blur'],
    startStateName: 'blurred',
    transitionsByEvent: {
        'focus': 'focused',
        'blur': 'blurred'
    },
    states: {
        focused: { onEnter: focus },
        blurred: { onEnter: blur },
    }
});

focus.enter();
focus.fireEvent('blur');
focus.fireEvent('focus');
focus.fireEvent('focus');
focus.fireEvent('blur');
focus.exit();

