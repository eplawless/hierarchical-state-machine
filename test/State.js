var expect = require('expect')
var sinon = require('sinon')
var State = require('State')

describe('State', function() {

    it('is a class', function() {
        expect(State).toBeA(Function);
    })

    describe('#constructor', function() {

        it('has no required parameters', function() {
            expect(function() { new State; }).toNotThrow();
        })

        it('accepts optional props and behaviors objects, as well as a parent state/state machine', function() {
            var calls = "";
            var s = new State({
                canEnter: function() { calls += '1'; return true; },
                onEnter: function() { calls += '3'; },
                canExit: function() { calls += '5'; return true; },
                onExit: function() { calls += '7'; }
            }, {
                beforeEnter: function() { calls += '2'; },
                afterEnter: function() { calls += '4'; },
                beforeExit: function() { calls += '6'; },
                afterExit: function() { calls += '8'; }
            });
            s.enter()
            s.exit()
            expect(calls).toBe("12345678");
        })

    })

    describe('#enter', function() {

        it('is a method', function() {
            expect(State.prototype.enter).toBeA(Function);
        })

        it('changes the state to an "entered" state', function() {
            var s = new State;
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
        })

        it('calls the state\'s before/on/afterEnter methods', function() {
            var calls = "";
            var s = new State({
                onEnter: function() { calls += '2'; }
            }, {
                beforeEnter: function() { calls += '1'; },
                afterEnter: function() { calls += '3'; }
            });
            s.enter();
            expect(calls).toBe("123");
        })

        it('does not change the state to be "entered" if canEnter returns falsy', function() {
            var onEnterSpy = sinon.spy();
            var calledCanEnter = false;
            var s = new State({
                canEnter: function() { calledCanEnter = true; return false; },
                onEnter: onEnterSpy
            })
            expect(calledCanEnter).toBe(false);
            expect(s._entered).toBe(false);
            s.enter();
            expect(calledCanEnter).toBe(true);
            expect(s._entered).toBe(false);
            expect(onEnterSpy.called).toBe(false);
        })

        it('does nothing if already entered', function() {
            var spy = sinon.spy();
            var s = new State({
                onEnter: spy
            }, {
                beforeEnter: spy,
                afterEnter: spy
            });
            s.enter();
            expect(spy.calledThrice).toBe(true)
            s.enter();
            expect(spy.calledThrice).toBe(true)
            s.exit();
            s.enter();
            expect(spy.calledThrice).toBe(false)
        })

        it('fires an "enters" observable', function() {
            var s = new State;
            var enterSpy = sinon.spy();
            s.enters.subscribe(enterSpy);
            s.enter();
            expect(enterSpy.calledOnce).toBe(true);
        })

    })

    describe('#exit', function() {

        it('is a method', function() {
            expect(State.prototype.exit).toBeA(Function);
        })

        it('changes the state to an "exited" state', function() {
            var s = new State;
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
            s.exit();
            expect(s._entered).toBe(false);
        })

        it('calls the state\'s before/on/afterExit methods', function() {
            var calls = "";
            var s = new State({
                onExit: function() { calls += '2'; }
            }, {
                beforeExit: function() { calls += '1'; },
                afterExit: function() { calls += '3'; }
            });
            s.enter();
            expect(calls).toBe("");
            s.exit();
            expect(calls).toBe("123");
        })

        it('does not change the state to be "exited" if canExit returns falsy', function() {
            var onExitSpy = sinon.spy();
            var calledCanExit = false;
            var s = new State({
                canExit: function() { calledCanExit = true; return false; },
                onExit: onExitSpy
            })
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
            expect(calledCanExit).toBe(false);
            s.exit();
            expect(calledCanExit).toBe(true);
            expect(s._entered).toBe(true);
            expect(onExitSpy.called).toBe(false);
        })

        it('does nothing if not entered', function() {
            var spy = sinon.spy();
            var s = new State({
                onExit: spy
            }, {
                beforeExit: spy,
                afterExit: spy
            });
            s.exit();
            expect(spy.called).toBe(false)
        })

        it('fires an "exits" observable', function() {
            var s = new State;
            var exitSpy = sinon.spy();
            s.exits.subscribe(exitSpy);
            s.exit();
            expect(exitSpy.called).toBe(false);
            s.enter();
            s.exit();
            expect(exitSpy.calledOnce).toBe(true);
        })

    })
})
