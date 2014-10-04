var StateMachine = require('./StateMachine');

function StateMachineFactory(props, behavior) {
    this._props = props;
    this._behavior = behavior;
}

StateMachineFactory.prototype = {
    create: function(behavior, parent) {
        return new StateMachine(
            this._props,
            behavior || this._behavior,
            parent);
    }
};

module.exports = StateMachineFactory;

