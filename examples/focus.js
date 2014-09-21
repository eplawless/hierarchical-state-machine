var StateMachine = require('../StateMachine');

function justPrint(value) {
    return function print() { console.log(value); }
}

var focus = new StateMachine({
    events: ['focus', 'blur'],
    startStateName: 'blurred',
    transitionOnEvents: {
        'focus': 'focused',
        'blur': 'blurred'
    },
    states: {
        focused: { onEnter: justPrint('focused') },
        blurred: { onEnter: justPrint('blurred') },
    }
});

focus.enter();
focus.getEvent('blur').onNext()
focus.getEvent('focus').onNext()
focus.getEvent('focus').onNext()
focus.getEvent('blur').onNext()
focus.exit();

