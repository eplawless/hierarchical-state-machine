var expect = require('expect')
var sinon = require('sinon')
var StateMachine = require('StateMachine')

describe('StateMachine', function() {

    it('is a class', function() {
        expect(StateMachine).toBeA(Function)
    })

    describe('#constructor', function() {

        it('requires a props object with a collection of states and a startStateName', function() {
            expect(function() { new StateMachine; }).toThrow()
            expect(function() { new StateMachine({}); }).toThrow()
            expect(function() { new StateMachine({ states: {} }) }).toThrow()
            expect(function() { new StateMachine({ startStateName: 'foo', states: {} }) }).toThrow()
            expect(function() { new StateMachine({ startStateName: 'foo', states: { foo: {} } }) }).toNotThrow()
        })

        it('accepts a props object and an optional behaviors object to extend it', function() {
            var calls = "";
            var sm = new StateMachine({
                onEnter: function() { calls += "2" },
                startStateName: "a",
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
                startStateName: 'a',
                states: { a: {} }
            });
            expect(sm.currentStateName).toBe(null)
            sm.enter();
            expect(sm.currentStateName).toEqual('a')
        })

        it('calls the state machine\'s onEnter method', function() {
            var onEnterSpy = sinon.spy();
            var sm = new StateMachine({
                startStateName: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true)
        })

        it('calls the start state\'s onEnter method after the state machine\'s onEnter', function() {
            var calls = "";
            var sm = new StateMachine({
                startStateName: 'a',
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
                startStateName: 'a',
                onEnter: onEnterSpy,
                states: { a: {} }
            });
            sm.enter();
            sm.enter();
            expect(onEnterSpy.calledOnce).toBe(true)
        })

        it('fires an "enters" observable', function() {
            var sm = new StateMachine({
                startStateName: 'a',
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
                startStateName: 'a',
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
                startStateName: 'a',
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
                startStateName: 'a',
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
                startStateName: 'a',
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
                startStateName: 'a',
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

})
