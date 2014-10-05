var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

// [x] TODO: privatize transition
// [x] TODO: fix eventHandlers to have EXPLICIT bubbling if you want it,
//           and to stop at the first handler which doesn't re-fire
// [x] TODO: disallow top-level eventHandlers for child states
// [ ] TODO: make it clearer that events are available to the entire FSM hierarchy (rename?)
// [x] TODO: make it clearer wtf transientProperties are (rename?)
// [x] TODO: remove allowSelfTransitions entirely
// [x] TODO: make all onExit/onEnters take transition info w/ data property && *from/to* properties
// [x] TODO: actually enforce private events

/**
 * State machine for the Hero Image Rotator.
 */
var heroImageRotator = new StateMachine({
    onUncaughtException: logError,
    onExit: printExiting,
    start: 'idle',
    inputEvents: ['stop', 'rotate', 'wait'],
    transientData: [
        'imageSources',
        'idxCurrentImage',
        'areImagesLoaded',
        'rotationInterval'
    ],
    transitions: [
        { event: 'stop', to: 'idle' },
        { event: 'rotate', to: 'active' },
        { event: 'rotate', from: 'active', to: 'active' }
    ],
    states: {
        'idle': { onEnter: rotateIfWeHaveNewImages },
        'active': {
            start: 'loading',
            inputEvents: ['loaded', 'doneWaiting'],
            transitions: [
                { event: 'wait', from: 'rotating', to: 'waiting' },
                { event: 'wait', from: 'waiting', to: 'waiting' },
                { event: 'loaded', from: 'loading', to: 'rotating' },
                { event: 'doneWaiting', from: 'waiting', to: 'rotating' },
            ],
            onEnter: updateImagesAndStopIfWeHaveNone,
            states: {
                'loading': { onEnter: loadImages },
                'rotating': { onEnter: rotateImages },
                'waiting': { onEnter: wait }
            },
        }
    }
});

/**
 *
 */
function printExiting() {
    console.log('HeroImageRotator: exiting');
}

/**
 * Log a thrown exception to stderr
 *
 * @param {State} heroImageRotator
 * @param {?} event
 */
function logError(heroImageRotator, error) {
    console.error('ERROR:', error);
}

/**
 * If we've got new images, activate, otherwise stay here.
 *
 * @para {State} idleState
 * @param [event]
 * @param [event.data]
 * @param [event.data.imageSources]
 */
function rotateIfWeHaveNewImages(idleState, event) {
    console.log('HeroImageRotator: idle');
    var data = event.data;
    if (data && typeof data === 'object' && 'imageSources' in data) {
        idleState.fireEvent('rotate', data);
    }
}

/**
 * If we've got new images then move into rotation (loading first if necessary).
 * If we don't have any images to rotate, deactivate.
 *
 * @param {State} activeState
 * @param {Object} [data]
 * @param {Object} [data.imageSources]
 */
function updateImagesAndStopIfWeHaveNone(activeState, event) {
    // take any new images
    var data = event.data;
    if (data && typeof data === 'object' && 'imageSources' in data) {
        activeState.setData('areImagesLoaded', false);
        activeState.setData('imageSources', data.imageSources);
        activeState.setData('idxCurrentImage', 0);
    }

    // jump back to idle if we don't have any images
    var imageSources = activeState.getData('imageSources');
    if (!Array.isArray(imageSources) || imageSources.length === 0) {
        activeState.fireEvent('stop');
        return;
    }
}

/**
 * Pretends to load all of the image sources we've got.
 *
 * @param {State} loadingState
 * @param {Object} [event]
 * @param {Object} [event.data]
 */
function loadImages(loadingState, event) {
    // skip the loading state if we've already loaded our images
    var data = event.data;
    if (loadingState.getData('areImagesLoaded')) {
        loadingState.fireEvent('loaded', data);
        return;
    }

    var imageSources = loadingState.getData('imageSources');
    console.log('HeroImageRotator: loading', imageSources.length, 'images');

    // pretend to load all the images we have
    Rx.Observable.interval(300)
        .takeUntil(loadingState.exits)
        .take(imageSources.length)
        .map(function(idx) { return imageSources[idx]; })
        .subscribe({
            onNext: function(source) {
                console.log('HeroImageRotator: Loaded image', source);
            },
            onCompleted: function() {
                console.log('HeroImageRotator: Loaded all images');
                loadingState.setData('areImagesLoaded', true);
                loadingState.fireEvent('loaded', data);
            }
        });
}

/**
 * Starts rotating between the loaded images from the rotating state.
 *
 * @param {State} rotatingState
 * @param {Object} [event]
 * @param {Object} [event.data]
 * @param {Number} [event.data.interval] Interval between showing images
 */
function rotateImages(rotatingState, event) {
    var data = event.data;
    console.log('HeroImageRotator: rotating');

    // show first image
    var imageSources = rotatingState.getData('imageSources');
    var idxCurrentImage = rotatingState.getData('idxCurrentImage');
    console.log('HeroImageRotator: showing image', imageSources[idxCurrentImage]);

    // show the other images on an interval
    if (data && typeof data === 'object' && 'interval' in data) {
        rotatingState.setData('rotationInterval', data.interval);
    }
    var interval = rotatingState.getData('rotationInterval') || 2000;

    Rx.Observable.interval(interval)
        .takeUntil(rotatingState.exits)
        .map(function() {
            return rotatingState.getData('idxCurrentImage');
        })
        .subscribe(function(idxLast) {
            var idx = (idxLast + 1) % imageSources.length;
            rotatingState.setData('idxCurrentImage', idx);
            console.log('HeroImageRotator: showing image', imageSources[idx]);
        });
}

/**
 * Waits for a specified duration before returning to rotation.
 *
 * Negative or falsy duration causes an immediate return to rotating state.
 * Infinity duration stays in this state until told otherwise.
 * Positive duration waits here for the specified number of milliseconds.
 *
 * @param {State} waitingState
 * @param {Object} [event]
 * @param {Object} [event.data]
 * @param {Number} [event.data.duration]
 */
function wait(waitingState, event) {
    // ignore negative or falsy durations
    var data = event.data;
    if (!data || !data.duration || data.duration <= 0) {
        console.log('HeroImageRotator: no wait duration, skipping');
        waitingState.fireEvent('doneWaiting');
        return;
    }

    // stay here until told otherwise for Infinity durations
    if (data.duration === Infinity) {
        console.log('HeroImageRotator: waiting until we\'re told to resume');
        return;
    }

    // wait then go back to rotating for positive durations
    console.log('HeroImageRotator: waiting', data.duration, 'ms');
    Rx.Observable.timer(data.duration)
        .takeUntil(waitingState.exits)
        .subscribe(function() {
            waitingState.fireEvent('doneWaiting');
        });
}


////////////////////////////////////////////////////////////////////////////////
// Demo Driver
////////////////////////////////////////////////////////////////////////////////

heroImageRotator.enter();
heroImageRotator.fireEvent('rotate', {
    imageSources: ['cat','dog','cow','monkey'],
    interval: 1000
});

function fireWaitEvent(duration) {
    heroImageRotator.fireEvent('wait', {
        duration: duration
    });
}

var stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
stdin.on('data', function(key){
    if (key == '\u0003') { // ctrl-c
        process.exit();
        return;
    }
    if (key === 'i') fireWaitEvent(Infinity);
    else if (key === 'w') fireWaitEvent(~~(Math.random()*2000));
    else if (key === 'r') heroImageRotator.fireEvent('rotate');
    else if (key === 's') heroImageRotator.fireEvent('stop');
});
