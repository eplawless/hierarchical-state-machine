var NOOP = function() {};
var Rx = require('rx');
var StateMachine = require('./StateMachine');

function print() {
    return console.log.apply(console, arguments);
}

function isAllowedWord(word) {
    return /cookie/.test(word);
}

var fsm = new StateMachine({
    startStateName: 'one',
    events: ['words', 'next'],
    onEnter: function() {
        this.getEvent('words')
            .takeUntil(this.exits)
            .subscribe(print);

        this.getEvent('next')
            .takeUntil(this.exits)
    },
    states: {
        one: {
            startStateName: 'two',
            events: ['words'],
            onEnter: function(one) {
                one.getEvent('words')
                    .takeUntil(one.exits)
                    .where(isAllowedWord)
                    .subscribe(one.getParentEvent('words'));
            },
            states: {
                two: {
                    onEnter: function() {
                        var words = this.getEvent('words');
                        var sendWord = words.onNext.bind(words);
                        ['bring','me','a','cookie'].forEach(sendWord);
                    }
                },
                three: {
                    onEnter: function() {
                        var words = this.getEvent('words');
                        var sendWord = words.onNext.bind(words);
                        ['bring','me','a','cookie'].forEach(sendWord);
                    }
                }
            }
        }
    }
});

fsm.enter();
fsm.exit();
