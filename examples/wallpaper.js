var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

var heroImageRotator = new StateMachine({
    start: 'stopped',
    events: ['stopped'],
    states: ['stopped', 'rotating', 'waiting'],
});

var wallpaper = new StateMachine({
    start: 'hidden',
    states: ['hidden','rotator'],
});
