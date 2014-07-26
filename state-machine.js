var Rx = require('rx')

var playerFactory = new StateMachineFactory({
    startState: 'stopped',
    onEnter: function() { console.log('starting up player') },
    onExit: function() { console.log('shutting down player') },
    states: {
        stopped: {
            startState: 'idle',
            onEnter: function() { console.log(' entering stopped state') },
            onExit: function() { console.log(' leaving stopped state') },
            states: {
                idle: {
                    onEnter: function() {
                        console.log('  entering stopped.idle state')
                        this.transition('error');
                    },
                    onExit: function() { console.log('  leaving stopped.idle state') },
                    onTransitionTo: {
                        error: function() { console.log('  moving from idle to error state!') }
                    }
                },
                error: {
                    onEnter: function() { console.log('  entering stopped.error state') },
                    onExit: function() { console.log('  exiting stopped.error state') }
                }
            }
        },
        playing: {
            onEnter: function() { console.log(' entering playing state') },
            onExit: function() { console.log(' leaving playing state') }
        }
    }
});

var player = playerFactory.create({
    beforeEnter: function() { console.log('about to start up player') },
    afterExit: function() { console.log('player was just shut down') },
    states: {
        stopped: {
            beforeEnter: function() { console.log(' before entering stopped state') },
            afterEnter: function() { console.log(' after entering stopped state') },
            states: {
                idle: {
                    beforeExit: function() { console.log('  before exiting idle state') },
                    beforeEnteringInto: {
                        error: function() { console.log('  after transition bit to idle') }
                    }
                }
            }
        }
    }
});

// player.enter()
// player.exit()

var focusStateMachineFactory = new StateMachineFactory({
    startState: 'blurred',
    onEnter: function() { this.focused = false; },
    onExit: function() { delete this.focused; },
    states: {
        focused: { onEnter: function() { this.focused = true; } },
        blurred: { onEnter: function() { this.focused = false; } }
    }
})

var focusStateMachine = focusStateMachineFactory.create({
    states: {
        focused: { afterEnter: function() { console.log('focused') } },
        blurred: { afterEnter: function() { console.log('blurred') } }
    }
});

// focusStateMachine.enter();
// focusStateMachine.transition('focused');
// focusStateMachine.exit();

