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
    startState: 'one',
    channels: ['words', 'next'],
    onEnter: function() {
        this.getChannel('words')
            .takeUntil(this.exits)
            .subscribe(print);

        this.getChannel('next')
            .takeUntil(this.exits)
    },
    states: {
        one: {
            startState: 'two',
            channels: ['words'],
            onEnter: function(one) {
                one.getChannel('words')
                    .takeUntil(one.exits)
                    .where(isAllowedWord)
                    .subscribe(one.getParentChannel('words'));
            },
            states: {
                two: {
                    onEnter: function() {
                        var words = this.getChannel('words');
                        var sendWord = words.onNext.bind(words);
                        ['bring','me','a','cookie'].forEach(sendWord);
                    }
                },
                three: {
                    onEnter: function() {
                        var words = this.getChannel('words');
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
