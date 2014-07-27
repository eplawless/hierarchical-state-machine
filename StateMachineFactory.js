var StateMachine = require('./StateMachine');

function StateMachineFactory(props) {
    this._props = props;
}

StateMachineFactory.prototype = {
    create: function(behavior, parent) {
        var result = new StateMachine(this._props, behavior, parent);
        return result;
    }
};

module.exports = StateMachineFactory;

