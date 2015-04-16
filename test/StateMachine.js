var expect = require('expect');
var sinon = require('sinon');
var StateMachine = require('StateMachine');
var Rx = require('rx');

/*eslint-disable brace-style*/

describe('StateMachine', function() {

    it('is a class', function() {
        expect(StateMachine).toBeA(Function);
    });

    describe('#constructor', function() {

        it('requires a props object with a collection of states and a start property', function() {
            /*eslint-disable no-new*/
            expect(function() { new StateMachine(); }).toThrow();
            expect(function() { new StateMachine({}); }).toThrow();
            expect(function() { new StateMachine({ states: {} }); }).toThrow();
            expect(function() { new StateMachine({ start: 'foo', states: {} }); }).toThrow();
            expect(function() { new StateMachine({ start: 'foo', states: { foo: {} } }); }).toNotThrow();
            /*eslint-enable no-new*/
        });

        it('accepts a props object and an optional behaviors object to extend it', function() {
            var calls = "";
            var sm = new StateMachine({
                onEnter: function() { calls += "2"; },
                start: "a",
                states: {
                    a: {
                        onEnter: function() { calls += "5"; }
                    }
                }
            }, {
                beforeEnter: function() { calls += "1"; },
                afterEnter: function() { calls += "3"; },
                states: {
                    a: {
                        beforeEnter: function() { calls += "4"; },
                        afterEnter: function() { calls += "6"; }
                    }
                }
            });
            sm.enter();
            expect(calls).toEqual("123456");
        });

    });

    describe('#enter', function() {

        it('is a method', function() {
            expect(StateMachine.prototype.enter).toBeA(Function);
        });

        it('enters the state machine\'s start state', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            expect(sm.currentStateName).toBe(null);
            sm.enter();
            expect(sm.currentStateName).toEqual('a');
        });

        it('calls the state machine\'s onEnter method', function() {
            var onEnterSpy = sinon.spy();
            var sm = new StateMachine({
                start: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true);
        });

        it('calls the start state\'s onEnter method after the state machine\'s onEnter', function() {
            var calls = "";
            var sm = new StateMachine({
                start: 'a',
                onEnter: function() { calls += "1"; },
                states: {
                    a: {
                        onEnter: function() { calls += "2"; }
                    }
                }
            });
            sm.enter();
            expect(calls).toEqual("12");
        });

        it('does nothing if the state machine is already entered', function() {
            var onEnterSpy = sinon.spy();
            var sm = new StateMachine({
                start: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true);
        });

        it('fires an "enters" observable', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            var enterSpy = sinon.spy();
            sm.enters.subscribe(enterSpy);
            sm.enter();
            expect(enterSpy.calledOnce).toBe(true);
        });

    });

    describe('#exit', function() {

        it('is a method', function() {
            expect(StateMachine.prototype.exit).toBeA(Function);
        });

        it('exits the state machine\'s current state', function() {
            var sm = new StateMachine({
                start: 'a',
                states: {
                    a: {}
                }
            });
            expect(sm.currentStateName).toBe(null);
            sm.enter();
            expect(sm.currentStateName).toEqual('a');
            sm.exit();
            expect(sm.currentStateName).toBe(null);
        });

        it('calls the state machine\'s onExit method', function() {
            var onExitSpy = sinon.spy();
            var sm = new StateMachine({
                start: 'a',
                onExit: onExitSpy,
                states: {
                    a: {}
                }
            });
            sm.enter();
            sm.exit();
            expect(onExitSpy.calledOnce).toBe(true);
        });

        it('calls the current state\'s onExit method before the state machine\'s', function() {
            var calls = "";
            var sm = new StateMachine({
                start: 'a',
                onExit: function() { calls += "2"; },
                states: {
                    a: {
                        onExit: function() { calls += "1"; }
                    }
                }
            });
            sm.enter();
            sm.exit();
            expect(calls).toEqual("12");
        });

        it('does nothing if the state machine is not entered', function() {
            var sm = new StateMachine({
                start: 'a',
                onExit: function() { throw new Error("called onExit"); },
                states: {
                    a: {
                        onExit: function() { throw new Error("called a.onExit"); }
                    }
                }
            });
            expect(sm.currentStateName).toBe(null);
            sm.exit();
            expect(sm.currentStateName).toBe(null);
        });

        it('fires an "exits" observable', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            var exitSpy = sinon.spy();
            sm.exits.subscribe(exitSpy);
            sm.exit();
            sm.enter();
            sm.exit();
            expect(exitSpy.calledOnce).toBe(true);
        });

    });

    describe('event handler and transition ordering', function() {

        it('fires event handlers on events', function() {
            var onEvent = sinon.spy();
            var fsm = new StateMachine({
                start: 'state',
                states: ['state'],
                inputEvents: ['event'],
                eventHandlers: { 'event': onEvent }
            });

            fsm.enter();
            fsm.fireEvent('event');
            expect(onEvent.calledOnce).toBe(true);
        });

    });

    describe('manually exiting a state', function() {

        it('checks if we\'re currently exiting or transitioning, and if not, exits our parent', function() {
            var fsm = new StateMachine({
                start: 'state',
                states: {
                    'state': {
                        onEnter: function(state) {
                            state.getEvents('quit')
                                .takeUntil(state.exits)
                                .subscribe(function() {
                                    state.exit();
                                });
                        }
                    }
                },
                inputEvents: ['quit']
            });

            fsm.enter();
            expect(fsm.isEntered).toBe(true);
            fsm.fireEvent('quit');
            expect(fsm.isEntered).toBe(false);
        });

        it('exits its parent if we tried to enter the state and it immediately exited', function() {
            var fsm = new StateMachine({
                start: 'one',
                inputEvents: ['next'],
                transitions: [{ event: 'next', to: 'two' }],
                states: {
                    'one': {},
                    'two': {
                        onEnter: function exit(state) {
                            state.exit();
                        }
                    }
                }
            });

            fsm.enter();
            expect(fsm.isEntered).toBe(true);
            fsm.fireEvent('next');
            expect(fsm.isEntered).toBe(false);
        });

        it('exits all its ancestors if we tried to enter the state and it immediately exited', function() {
            var called = false;
            var fsm = new StateMachine({
                start: 'one',
                states: {
                    'one': {
                        start: 'two',
                        states: {
                            'two': {
                                start: 'three',
                                states: ['three'],
                                onEnter: function exit(state) {
                                    called = true;
                                    state.exit();
                                }
                            }
                        }
                    }
                }
            });

            fsm.enter();
            expect(called).toBe(true);
            expect(fsm.isEntered).toBe(false);
        });

    });

    describe('exception handling', function() {

        it('throws exceptions from its start state\'s onEnter method when entering', function() {
            var fsm = new StateMachine({
                start: 'state',
                states: {
                    'state': {
                        onEnter: function() {
                            throw new Error('foo');
                        }
                    }
                }
            });

            expect(function() { fsm.enter(); }).toThrow();
            expect(fsm.isEntered).toBe(false);
        });

        it('throws exceptions from the next state\'s onEnter method when transitioning', function() {
            var fsm = new StateMachine({
                start: 'a',
                states: [
                    'a',
                    { name: 'b', onEnter: function() { throw new Error("bar"); } }
                ]
            });

            fsm.enter();
            expect(function() { fsm.transition('b'); }).toThrow();
        });

        it('throws exceptions from the first state\'s onExit method when transitioning', function() {
            var fsm = new StateMachine({
                start: 'a',
                states: [
                    { name: 'a', onExit: function() { throw new Error("baz"); } },
                    'b'
                ]
            });

            fsm.enter();
            expect(function() { fsm.transition('b'); }).toThrow();
        });

        it('throws exceptions from a nested state\'s onEnter method when entering', function() {
            var fsm = new StateMachine({
                start: 'a',
                states: {
                    a: {
                        start: 'b',
                        states: {
                            b: { onEnter: function() { throw new Error("quux"); } }
                        }
                    }
                }
            });

            expect(function() { fsm.enter(); }).toThrow();
        });

        it('throws exceptions from a nested state\'s onEnter method on an event transition', function() {
            var fsm = new StateMachine({
                start: 'a',
                inputEvents: ['x'],
                states: {
                    a: {
                        start: 'b',
                        transitions: [
                            { event: 'x', from: 'b', to: 'c' }
                        ],
                        states: {
                            b: {},
                            c: {
                                onEnter: function() {
                                    throw new Error("quux");
                                }
                            }
                        }
                    }
                }
            });

            fsm.enter();
            expect(function() { fsm.fireEvent('x'); }).toThrow();
        });

    });

    describe('props', function() {

        describe('.persistentData', function() {

            it('sticks around arbitrarily deep in hierarchies', function() {
                var value = '';
                var top = new StateMachine({
                    start: 'middle',
                    states: {
                        'middle': {
                            start: 'bottom',
                            states: {
                                'bottom': {
                                    persistentData: ['count'],
                                    onEnter: function(state) {
                                        var count = state.getData('count') || 1;
                                        value += count;
                                        state.setData('count', count + 1);
                                    }
                                }
                            }
                        }
                    }
                });

                top.enter();
                expect(value).toBe('1');
                top.exit();
                top.enter();
                expect(value).toBe('12');
                top.exit();
                top.enter();
                expect(value).toBe('123');

            });

        });

        describe('.transitions', function() {

            it('can include a predicate function and won\'t transition if it returns falsy', function() {
                var onEnter = sinon.spy();
                var fsm = new StateMachine({
                    start: 'a',
                    inputEvents: ['next'],
                    persistentData: ['dayOfTheWeek'],
                    transitions: [
                        { event: 'next', from: 'a', to: 'b', predicate: isTuesdayAndIsPolite }
                    ],
                    states: {
                        'a': {},
                        'b': { onEnter: onEnter }
                    }
                });

                function isTuesdayAndIsPolite(state, data) {
                    var dayOfTheWeek = state.getData('dayOfTheWeek');
                    return dayOfTheWeek === 'tuesday' && data && data.please;
                }

                fsm.enter();
                expect(fsm.currentStateName).toBe('a');
                fsm.setData('dayOfTheWeek', 'monday');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('a');
                fsm.setData('dayOfTheWeek', 'tuesday');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('a');
                fsm.fireEvent('next', { please: true });
                expect(fsm.currentStateName).toBe('b');
            });

            it('allows multiple transitions which differ only by predicate', function() {

                var fsm = new StateMachine({
                    start: 'one',
                    states: ['one', 'two'],
                    inputEvents: ['next'],
                    persistentData: ['day'],
                    transitions: [
                        { event: 'next', from: 'one', to: 'two', predicate: isMonday },
                        { event: 'next', from: 'one', to: 'two', predicate: isTuesday }
                    ]
                });

                function isMonday(state) {
                    return state.getData('day') === 'monday';
                }

                function isTuesday(state) {
                    return state.getData('day') === 'tuesday';
                }

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.setData('day', 'monday');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('two');
                fsm.exit();

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.setData('day', 'tuesday');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('two');

            });

            it('evaluates transitions with a from property before those without', function() {
                var fsm = new StateMachine({
                    start: 'one',
                    states: ['one', 'two', 'three', 'four', 'five'],
                    inputEvents: ['next'],
                    transitions: [
                        { event: 'next', to: 'two' },
                        { event: 'next', from: 'one', to: 'three' },
                        { event: 'next', to: 'four' },
                        { event: 'next', from: 'one', to: 'five' },
                        { event: 'next', from: 'two', to: 'one' }
                    ]
                });

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('three');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('two');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('three');
            });

            it('evaluates transitions of equal specificity in the order they appear', function() {
                var fsm = new StateMachine({
                    start: 'one',
                    states: ['one', 'two', 'three', 'four'],
                    inputEvents: ['next'],
                    transitions: [
                        { event: 'next', to: 'two' },
                        { event: 'next', to: 'three' },
                        { event: 'next', to: 'four' }
                    ]
                });

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('two');
            });

            it('does not allow self transitions by default if not provided a from: state', function() {
                var onExit = sinon.spy();
                var fsm = new StateMachine({
                    start: 'one',
                    states: {
                        'one': { onExit: onExit },
                        'two': {}
                    },
                    inputEvents: ['next'],
                    transitions: [
                        { event: 'next', to: 'one' }
                    ]
                });

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('one');
                expect(onExit.called).toBe(false);
            });

            it('allows self transitions by default if provided a from: state', function() {
                var onExit = sinon.spy();
                var fsm = new StateMachine({
                    start: 'one',
                    states: {
                        'one': { onExit: onExit },
                        'two': {}
                    },
                    inputEvents: ['next'],
                    transitions: [
                        { event: 'next', from: 'one', to: 'one' }
                    ]
                });

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('one');
                expect(onExit.called).toBe(true);
            });

            it('allows self transitions if explicitly specified', function() {
                var onExit = sinon.spy();
                var fsm = new StateMachine({
                    start: 'one',
                    states: {
                        'one': { onExit: onExit },
                        'two': {}
                    },
                    inputEvents: ['next'],
                    transitions: [
                        { event: 'next', to: 'one', allowSelfTransition: true }
                    ]
                });

                fsm.enter();
                expect(fsm.currentStateName).toBe('one');
                fsm.fireEvent('next');
                expect(fsm.currentStateName).toBe('one');
                expect(onExit.called).toBe(true);

            });

        });

    });

    describe('#transitions', function() {

        it('is an observable', function() {
            var fsm = new StateMachine({
                start: 'one',
                states: ['one']
            });
            expect(fsm.transitions).toBeAn(Rx.Observable);
        });

        it('emits when entering and exiting the FSM', function() {
            var fsm = new StateMachine({
                start: 'one',
                states: ['one']
            });
            var count = 0;
            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(transition).toEqual({
                    from: null,
                    to: { name: 'one' }
                });
            });
            fsm.transitions.skip(1).take(1).subscribe(function(transition) {
                ++count;
                expect(transition).toEqual({
                    from: { name: 'one' },
                    to: null
                });
            });
            fsm.enter();
            fsm.exit();
            expect(count).toBe(2);
        });

        it('emits when transitioning between states', function() {
            var fsm = new StateMachine({
                start: 'one',
                states: ['one', 'two'],
                inputEvents: ['next'],
                transitions: [
                    { event: 'next', from: 'one', to: 'two' },
                    { event: 'next', from: 'two', to: 'one' }
                ]
            });
            var count = 0;
            fsm.enter();
            fsm.transitions.take(1).subscribe(function(transition) {
                expect(fsm.currentStateName).toBe('two');
                ++count;
                expect(transition).toEqual({
                    from: { name: 'one' },
                    to: { name: 'two' }
                });
            });
            expect(fsm.currentStateName).toBe('one');
            fsm.fireEvent('next');
            expect(fsm.currentStateName).toBe('two');
            expect(count).toBe(1);
            fsm.exit();
        });

        it('doesn\'t freak out when you subscribe to transitions inside a transitions onNext', function(done) {
            var fsm = new StateMachine({
                start: 'one',
                states: ['one', 'two', 'three'],
                inputEvents: ['next'],
                transitions: [
                    { event: 'next', from: 'one', to: 'two' },
                    { event: 'next', from: 'two', to: 'three' },
                    { event: 'next', from: 'three', to: 'one' }
                ]
            });

            fsm.enter();
            expect(fsm.currentStateName).toBe('one');
            fsm.transitions.take(1).subscribe(function(firstTransition) {
                try {
                    expect(firstTransition).toEqual({
                        from: { name: 'one' },
                        to: { name: 'two' }
                    });
                    expect(fsm.currentStateName).toBe('two');
                    fsm.transitions.take(1).subscribe(function(secondTransition) {
                        try {
                            expect(secondTransition).toEqual({
                                from: { name: 'two' },
                                to: { name: 'three' }
                            });
                            expect(fsm.currentStateName).toBe('three');
                            done();
                        } catch (error) {
                            done(error);
                        }
                    });
                    fsm.fireEvent('next');
                } catch (error) {
                    done(error);
                }
            });
            fsm.fireEvent('next');
            fsm.exit();
        });

        it('is recursive, and fires with every state change', function() {
            function isInSubStateB(state) {
                return state.currentStateName === 'b';
            }

            var fsm = new StateMachine({
                start: 'one',
                inputEvents: ['next'],
                transitions: [
                    { event: 'next', from: 'one', to: 'two', predicate: isInSubStateB },
                    { event: 'next', from: 'two', to: 'one' }
                ],
                states: {
                    'one': {
                        start: 'a',
                        states: ['a', 'b'],
                        transitions: [
                            { event: 'next', from: 'a', to: 'b' }
                        ]
                    },
                    'two': {}
                }
            });

            var count = 0;
            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data one',
                    from: null,
                    to: {
                        name: 'one',
                        subState: { name: 'a' }
                    }
                });
            });
            fsm.enter('data one');
            expect(count).toBe(1);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data two',
                    from: {
                        name: 'one',
                        subState: { name: 'a' }
                    },
                    to: {
                        name: 'one',
                        subState: { name: 'b' }
                    }
                });
            });
            fsm.fireEvent('next', 'data two');
            expect(count).toBe(2);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('two');
                expect(transition).toEqual({
                    data: 'data three',
                    from: {
                        name: 'one',
                        subState: { name: 'b' }
                    },
                    to: {
                        name: 'two'
                    }
                });
            });
            fsm.fireEvent('next', 'data three');
            expect(count).toBe(3);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data four',
                    from: {
                        name: 'two'
                    },
                    to: {
                        name: 'one',
                        subState: { name: 'a' }
                    }
                });
            });
            fsm.fireEvent('next', 'data four');
            expect(count).toBe(4);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data five',
                    from: {
                        name: 'one',
                        subState: { name: 'a' }
                    },
                    to: null
                });
            });
            fsm.exit('data five');
            expect(count).toBe(5);
        });

        it('behaves reasonably with child state machines that transition on enter', function() {
            function isInSubStateC(state) {
                return state.currentStateName === 'c';
            }

            function fireNext(data, state) {
                state.fireEvent('next', data);
            }

            var fsm = new StateMachine({
                start: 'one',
                inputEvents: ['next'],
                transitions: [
                    { event: 'next', from: 'one', to: 'two', predicate: isInSubStateC },
                    { event: 'next', from: 'two', to: 'one' }
                ],
                states: {
                    'one': {
                        start: 'a',
                        states: [
                            { name: 'a', onEnter: fireNext.bind(null, 'data two') },
                            { name: 'b' },
                            { name: 'c', onEnter: fireNext.bind(null, 'data four') }
                        ],
                        transitions: [
                            { event: 'next', from: 'a', to: 'b' },
                            { event: 'next', from: 'b', to: 'c' }
                        ]
                    },
                    'two': {}
                }
            });

            var count = 0;
            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data one',
                    from: null,
                    to: { name: 'one', subState: { name: 'a' } }
                });
            });
            fsm.transitions.skip(1).take(1).subscribe(function(transition) {
                expect(count).toBe(1);
                ++count;
                expect(fsm.currentStateName).toBe('one');
                expect(transition).toEqual({
                    data: 'data two',
                    from: { name: 'one', subState: { name: 'a' } },
                    to: { name: 'one', subState: { name: 'b' } }
                });
            });
            fsm.enter('data one');
            // implicit 'next' on enter 'one'
            expect(count).toBe(2);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(transition).toEqual({
                    data: 'data three',
                    from: { name: 'one', subState: { name: 'b' } },
                    to: { name: 'one', subState: { name: 'c' } }
                });
                expect(fsm.currentStateName).toBe('one');
            });
            fsm.transitions.skip(1).take(1).subscribe(function(transition) {
                ++count;
                expect(transition).toEqual({
                    data: 'data four',
                    from: { name: 'one', subState: { name: 'c' } },
                    to: { name: 'two' }
                });
                expect(fsm.currentStateName).toBe('two');
            });
            fsm.fireEvent('next', 'data three')
            // implicit 'next' on enter 'c'
            expect(count).toBe(4);

            fsm.transitions.take(1).subscribe(function(transition) {
                ++count;
                expect(transition).toEqual({
                    data: 'data four',
                    from: { name: 'two' },
                    to: null
                });
                expect(fsm.currentStateName).toBe('two');
            });
            fsm.exit('data four');
            expect(count).toBe(5);

        });

    });

});

/*eslint-enable brace-style*/

