var expect = require('expect');
var sinon = require('sinon');
var State = require('State');
var Rx = require('rx');

/*eslint-disable brace-style*/
/*eslint-disable no-new*/

describe('State', function() {

    it('is a class', function() {
        expect(State).toBeA(Function);
    });

    describe('#constructor', function() {

        it('has no required parameters', function() {
            expect(function() { new State(); }).toNotThrow();
        });

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
            s.enter();
            s.exit();
            expect(calls).toBe("12345678");
        });

    });

    describe('#enter', function() {

        it('is a method', function() {
            expect(State.prototype.enter).toBeA(Function);
        });

        it('takes an optional data argument which it passes through to its event handlers', function() {
            var calls = "";
            var s = new State({
                onEnter: function(state, data) { calls += '2' + data; }
            }, {
                beforeEnter: function(state, data) { calls += '1' + data; },
                afterEnter: function(state, data) { calls += '3' + data; }
            });
            s.enters.subscribe(function(data) { calls += '0' + data; });
            s.enter('and');
            expect(calls).toBe('0and1and2and3and');
        });

        it('changes the state to an "entered" state', function() {
            var s = new State();
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
        });

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
        });

        it('does not change the state to be "entered" if canEnter returns falsy', function() {
            var onEnterSpy = sinon.spy();
            var calledCanEnter = false;
            var s = new State({
                canEnter: function() { calledCanEnter = true; return false; },
                onEnter: onEnterSpy
            });
            expect(calledCanEnter).toBe(false);
            expect(s._entered).toBe(false);
            s.enter();
            expect(calledCanEnter).toBe(true);
            expect(s._entered).toBe(false);
            expect(onEnterSpy.called).toBe(false);
        });

        it('does nothing if already entered', function() {
            var spy = sinon.spy();
            var s = new State({
                onEnter: spy
            }, {
                beforeEnter: spy,
                afterEnter: spy
            });
            s.enter();
            expect(spy.calledThrice).toBe(true);
            s.enter();
            expect(spy.calledThrice).toBe(true);
            s.exit();
            s.enter();
            expect(spy.calledThrice).toBe(false);
        });

        it('fires an "enters" observable', function() {
            var s = new State();
            var enterSpy = sinon.spy();
            s.enters.subscribe(enterSpy);
            s.enter();
            expect(enterSpy.calledOnce).toBe(true);
        });

    });

    describe('#exit', function() {

        it('is a method', function() {
            expect(State.prototype.exit).toBeA(Function);
        });

        it('changes the state to an "exited" state', function() {
            var s = new State();
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
            s.exit();
            expect(s._entered).toBe(false);
        });

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
        });

        it('does not change the state to be "exited" if canExit returns falsy', function() {
            var onExitSpy = sinon.spy();
            var calledCanExit = false;
            var s = new State({
                canExit: function() { calledCanExit = true; return false; },
                onExit: onExitSpy
            });
            expect(s._entered).toBe(false);
            s.enter();
            expect(s._entered).toBe(true);
            expect(calledCanExit).toBe(false);
            s.exit();
            expect(calledCanExit).toBe(true);
            expect(s._entered).toBe(true);
            expect(onExitSpy.called).toBe(false);
        });

        it('does nothing if not entered', function() {
            var spy = sinon.spy();
            var s = new State({
                onExit: spy
            }, {
                beforeExit: spy,
                afterExit: spy
            });
            s.exit();
            expect(spy.called).toBe(false);
        });

        it('fires an "exits" observable', function() {
            var s = new State();
            var exitSpy = sinon.spy();
            s.exits.subscribe(exitSpy);
            s.exit();
            expect(exitSpy.called).toBe(false);
            s.enter();
            s.exit();
            expect(exitSpy.calledOnce).toBe(true);
        });

    });

    describe('#canEnter', function() {

        it('is a method', function() {
            expect(State.prototype.canEnter).toBeA(Function);
        });

        it('returns whether we are currently able to enter this state', function() {
            var s = new State();
            expect(s.canEnter()).toBe(true);
        });

        it('returns false if the state is already entered', function() {
            var s = new State();
            expect(s.canEnter()).toBe(true);
            s.enter();
            expect(s.canEnter()).toBe(false);
        });

        it('invokes the canEnter function from its properties object, if it\'s provided', function() {
            var s = new State({
                canEnter: function() { return false; }
            });
            expect(s.canEnter()).toBe(false);
        });

    });

    describe('#canExit', function() {

        it('is a method', function() {
            expect(State.prototype.canExit).toBeA(Function);
        });

        it('returns whether we are currently able to exit this state', function() {
            var s = new State();
            expect(s.canExit()).toBe(false);
        });

        it('returns false if the state is not currently entered', function() {
            var s = new State();
            expect(s.canExit()).toBe(false);
            s.enter();
            expect(s.canExit()).toBe(true);
        });

        it('invokes the canExit function from its properties object, if it\'s provided', function() {
            var s = new State({
                canExit: function() { return false; }
            });
            expect(s.canExit()).toBe(false);
            s.enter();
            expect(s.canExit()).toBe(false);
        });

    });

    describe('#fireEvent', function() {

        it('is a method', function() {
            expect(State.prototype.fireEvent).toBeA(Function);
        });

        // TODO: a lot more

    });

    describe('.enters', function() {

        it('is an Observable', function() {
            var s = new State();
            expect(s.enters).toBeA(Rx.Observable);
        });

        it('fires when the state is entered, just before the beforeEnter callback', function() {
            var calls = "";
            var s = new State({}, {
                beforeEnter: function() { calls += "2"; }
            });
            s.enters.subscribe(function() { calls += "1"; });
            expect(calls).toBe("");
            s.enter();
            expect(calls).toBe("12");
        });

        it('is passed any data given to the #enter method', function() {
            var s = new State();
            var onEnter = sinon.spy();
            var data = { x: 1 };
            s.enters.subscribe(onEnter);
            s.enter(data);
            expect(onEnter.calledWith(data)).toBe(true);
        });

    });

    describe('.exits', function() {

        it('is an Observable', function() {
            var s = new State();
            expect(s.exits).toBeA(Rx.Observable);
        });

        it('fires when the state is exited, just after the beforeExit callback', function() {
            var calls = "";
            var s = new State({}, {
                beforeExit: function() { calls += "1"; }
            });
            s.exits.subscribe(function() { calls += "2"; });
            s.enter();
            expect(calls).toBe("");
            s.exit();
            expect(calls).toBe("12");
        });

        it('is passed any data given to the #exit method', function() {
            var s = new State();
            var onExit = sinon.spy();
            var data = { x: 1 };
            s.exits.subscribe(onExit);
            s.enter();
            expect(onExit.called).toBe(false);
            s.exit(data);
            expect(onExit.calledWith(data)).toBe(true);
        });

    });

    describe('#hasData', function() {

        it('is a method', function() {
            expect(State.prototype.hasData).toBeA(Function);
        });

        it('checks to see if a given name is in this state\'s transientData', function() {
            var s = new State({
                transientData: ['a']
            });
            expect(s.hasData('b')).toBe(false);
            expect(s.hasData('a')).toBe(true);
        });

        it('checks to see if a given name is in this state\'s transientData', function() {
            var s = new State({
                transientData: ['a']
            });
            expect(s.hasData('b')).toBe(false);
            expect(s.hasData('a')).toBe(true);
        });

        it('checks up the parent state chain if it can\'t find a property', function() {
            var parent = new State({
                transientData: ['a']
            });
            var child = new State({}, {}, parent);
            expect(child.hasData('a')).toBe(true);
            expect(child.hasData('b')).toBe(false);
        });

    });

    describe('#getData', function() {

        it('is a method', function() {
            expect(State.prototype.getData).toBeA(Function);
        });

        it('throws if the property is not declared in transientData (or its parent\'s)', function() {
            var s = new State({
                transientData: ['a']
            });
            expect(function() { s.getData('b'); }).toThrow();
            expect(function() { s.getData('a'); }).toNotThrow();
        });

        it('gets falsy values properly', function() {
            var s = new State({ transientData: ['a'] });
            s.setData('a', 0);
            expect(s.getData('a')).toBe(0);
        });

        it('gets a previously set property value');

    });

    describe('props', function() {

        describe('.transientData', function() {

            it('describes data which is cleared when the state exits', function() {
                var value = "";
                var fsm = new State({
                    transientData: ['count'],
                    onEnter: function(state) {
                        var count = state.getData('count') || 1;
                        value += count;
                        state.setData('count', count + 1);
                    }
                });
                fsm.enter();
                expect(value).toBe('1');
                fsm.exit();
                fsm.enter();
                expect(value).toBe('11');
                fsm.exit();
                fsm.enter();
                expect(value).toBe('111');
            });

        });

        describe('.persistentData', function() {

            it('describes data which sticks around even after the state exits', function() {
                var value = "";
                var fsm = new State({
                    persistentData: ['count'],
                    onEnter: function(state) {
                        var count = state.getData('count') || 1;
                        value += count;
                        state.setData('count', count + 1);
                    }
                });
                fsm.enter();
                expect(value).toBe('1');
                fsm.exit();
                fsm.enter();
                expect(value).toBe('12');
                fsm.exit();
                fsm.enter();
                expect(value).toBe('123');
            });

        });

    });

});
