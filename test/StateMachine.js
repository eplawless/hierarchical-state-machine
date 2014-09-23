var expect = require('expect')
var sinon = require('sinon')
var StateMachine = require('StateMachine')
var Rx = require('rx');

describe('StateMachine', function() {

    it('is a class', function() {
        expect(StateMachine).toBeA(Function)
    })

    describe('#constructor', function() {

        it('requires a props object with a collection of states and a start property', function() {
            expect(function() { new StateMachine; }).toThrow()
            expect(function() { new StateMachine({}); }).toThrow()
            expect(function() { new StateMachine({ states: {} }) }).toThrow()
            expect(function() { new StateMachine({ start: 'foo', states: {} }) }).toThrow()
            expect(function() { new StateMachine({ start: 'foo', states: { foo: {} } }) }).toNotThrow()
        })

        it('accepts a props object and an optional behaviors object to extend it', function() {
            var calls = "";
            var sm = new StateMachine({
                onEnter: function() { calls += "2" },
                start: "a",
                states: {
                    a: {
                        onEnter: function() { calls += "5" }
                    }
                }
            }, {
                beforeEnter: function() { calls += "1" },
                afterEnter: function() { calls += "3" },
                states: {
                    a: {
                        beforeEnter: function() { calls += "4" },
                        afterEnter: function() { calls += "6" }
                    }
                }
            })
            sm.enter()
            expect(calls).toEqual("123456")
        })

    })

    describe('#enter', function() {

        it('is a method', function() {
            expect(StateMachine.prototype.enter).toBeA(Function)
        })

        it('enters the state machine\'s start state', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            expect(sm.currentStateName).toBe(null)
            sm.enter();
            expect(sm.currentStateName).toEqual('a')
        })

        it('calls the state machine\'s onEnter method', function() {
            var onEnterSpy = sinon.spy();
            var sm = new StateMachine({
                start: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true)
        })

        it('calls the start state\'s onEnter method after the state machine\'s onEnter', function() {
            var calls = "";
            var sm = new StateMachine({
                start: 'a',
                onEnter: function() { calls += "1" },
                states: {
                    a: {
                        onEnter: function() { calls += "2" }
                    }
                }
            });
            sm.enter();
            expect(calls).toEqual("12")
        })

        it('does nothing if the state machine is already entered', function() {
            var onEnterSpy = sinon.spy();
            var sm = new StateMachine({
                start: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true)
        })

        it('fires an "enters" observable', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            var enterSpy = sinon.spy();
            sm.enters.subscribe(enterSpy);
            sm.enter();
            expect(enterSpy.calledOnce).toBe(true);
        })

    })

    describe('#exit', function() {

        it('is a method', function() {
            expect(StateMachine.prototype.exit).toBeA(Function);
        })

        it('exits the state machine\'s current state', function() {
            var sm = new StateMachine({
                start: 'a',
                states: {
                    a: {}
                }
            });
            expect(sm.currentStateName).toBe(null)
            sm.enter();
            expect(sm.currentStateName).toEqual('a')
            sm.exit();
            expect(sm.currentStateName).toBe(null)
        })

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
            expect(onExitSpy.calledOnce).toBe(true)
        })

        it('calls the current state\'s onExit method before the state machine\'s', function() {
            var calls = "";
            var sm = new StateMachine({
                start: 'a',
                onExit: function() { calls += "2" },
                states: {
                    a: {
                        onExit: function() { calls += "1" }
                    }
                }
            });
            sm.enter();
            sm.exit();
            expect(calls).toEqual("12")
        })

        it('does nothing if the state machine is not entered', function() {
            var sm = new StateMachine({
                start: 'a',
                onExit: function() { throw new Error("called onExit") },
                states: {
                    a: {
                        onExit: function() { throw new Error("called a.onExit") }
                    }
                }
            });
            expect(sm.currentStateName).toBe(null)
            sm.exit()
            expect(sm.currentStateName).toBe(null)
        })

        it('fires an "exits" observable', function() {
            var sm = new StateMachine({
                start: 'a',
                states: { a: {} }
            });
            var exitSpy = sinon.spy();
            sm.exits.subscribe(exitSpy);
            sm.exit()
            sm.enter();
            sm.exit()
            expect(exitSpy.calledOnce).toBe(true);
        })

    })

    describe('event handler and transition ordering', function() {

        it('fires global event handlers in the order they appear', function() {
            var calls = "";
            var fsm = new StateMachine({
                start: 'state',
                states: ['state'],
                events: ['event'],
                eventHandlers: [
                    { event: 'event', handler: function() { calls += "1"; } },
                    { event: 'event', handler: function() { calls += "2"; } },
                    { event: 'event', handler: function() { calls += "3"; } },
                    { event: 'event', handler: function() { calls += "4"; } },
                    { event: 'event', handler: function() { calls += "5"; } }
                ]
            });

            fsm.enter();
            fsm.fireEvent('event');
            expect(calls).toBe("12345");
        });

        it('fires state event handlers before global event handlers, in the order they appear', function() {
            var calls = "";
            var fsm = new StateMachine({
                start: 'state',
                states: ['state'],
                events: ['event'],
                eventHandlers: [
                    { event: 'event', handler: function() { calls += "4"; } },
                    { event: 'event', state: 'state', handler: function() { calls += "1"; } },
                    { event: 'event', handler: function() { calls += "5"; } },
                    { event: 'event', state: 'state', handler: function() { calls += "2"; } },
                    { event: 'event', handler: function() { calls += "6"; } },
                    { event: 'event', state: 'state', handler: function() { calls += "3"; } },
                ]
            });

            fsm.enter();
            fsm.fireEvent('event');
            expect(calls).toBe("123456");
        })

        it('fires top-level event handlers before nested event handlers', function() {
            var calls = "";
            function call(number) { return function() { calls += number; } }
            var fsm = new StateMachine({
                start: 'state',
                events: ['event'],
                eventHandlers: [
                    { event: 'event', handler: call("3") },
                    { event: 'event', state: 'state', handler: call("1") },
                    { event: 'event', handler: call("4") },
                    { event: 'event', state: 'state', handler: call("2") },
                ],
                states: {
                    state: {
                        start: 'substate',
                        states: ['substate'],
                        eventHandlers: [
                            { event: 'event', handler: call("7") },
                            { event: 'event', state: 'substate', handler: call("5") },
                            { event: 'event', handler: call("8") },
                            { event: 'event', state: 'substate', handler: call("6") },
                        ]
                    }
                },
            });

            fsm.enter();
            fsm.fireEvent('event');
            expect(calls).toBe("12345678");
        })

        it('doesn\'t keep transitioning if its new state can respond to the transition event', function() {
            var spy = sinon.spy();
            var fsm = new StateMachine({
                start: 'a',
                states: {
                    a: { onEnter: spy },
                    b: { onEnter: spy },
                    c: { onEnter: spy },
                },
                events: ['event'],
                transitions: [
                    { event: 'event', from: 'a', to: 'b' },
                    { event: 'event', from: 'b', to: 'c' },
                    { event: 'event', from: 'c', to: 'a' },
                ]
            })

            fsm.enter();
            expect(spy.calledOnce).toBe(true);
            fsm.fireEvent('event');
            expect(spy.calledTwice).toBe(true);
            fsm.fireEvent('event');
            expect(spy.calledThrice).toBe(true);
        })

        it('fires state-specific transitions before global transitions', function() {
            var spy = sinon.spy();
            var fsm = new StateMachine({
                start: 'a',
                states: ['a', { name: 'b', onEnter: spy }, { name: 'c', onEnter: spy }],
                events: ['event'],
                transitions: [
                    { event: 'event', to: 'c' },
                    { event: 'event', from: 'a', to: 'b' },
                ]
            })

            fsm.enter();
            expect(fsm.currentStateName).toBe('a');
            expect(spy.called).toBe(false);
            fsm.fireEvent('event');
            expect(fsm.currentStateName).toBe('b');
            expect(spy.calledOnce).toBe(true);
        })

        it('checks global transitions in the order they appear and fires the first that matches', function() {
            var spy = sinon.spy();
            var fsm = new StateMachine({
                start: 'a',
                states: ['a', { name: 'b', onEnter: spy }, { name: 'c', onEnter: spy }],
                events: ['event'],
                transitions: [
                    { event: 'event', to: 'c' },
                    { event: 'event', to: 'b' },
                ]
            })

            fsm.enter();
            expect(fsm.currentStateName).toBe('a');
            expect(spy.called).toBe(false);
            fsm.fireEvent('event');
            expect(fsm.currentStateName).toBe('c');
            expect(spy.calledOnce).toBe(true);
        })

        it('checks state-specific transitions in order and fires the first that matches', function() {
            var spy = sinon.spy();
            var fsm = new StateMachine({
                start: 'a',
                states: {
                    a: {},
                    b: { onEnter: spy },
                    c: { onEnter: spy },
                    d: { onEnter: spy },
                },
                events: ['event'],
                transitions: [
                    { event: 'event', to: 'd' },
                    { event: 'event', from: 'a', to: 'b' },
                    { event: 'event', from: 'a', to: 'c' },
                ]
            })

            fsm.enter();
            expect(fsm.currentStateName).toBe('a');
            expect(spy.called).toBe(false);
            fsm.fireEvent('event');
            expect(fsm.currentStateName).toBe('b');
            expect(spy.calledOnce).toBe(true);
        })

        it('fires event handlers before transitions', function() {
            var calls = "";
            function call(number) { return function() { calls += number; } }
            var fsm = new StateMachine({
                start: 'a',
                states: ['a', { name: 'b', onEnter: call("3") }],
                events: ['event'],
                eventHandlers: [
                    { event: 'event', handler: call("2") },
                    { event: 'event', state: 'a', handler: call("1") }
                ],
                transitions: [
                    { event: 'event', from: 'a', to: 'b' }
                ]
            })

            fsm.enter();
            fsm.fireEvent('event');
            expect(calls).toBe("123");
        })

    })

})
