var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

// [x] TODO: privatize transition
// [x] TODO: fix eventHandlers to have EXPLICIT bubbling if you want it,
//           and to stop at the first handler which doesn't re-fire
// [x] TODO: disallow top-level eventHandlers for child states
// [ ] TODO: make it clearer that events are available to the entire FSM hierarchy (rename?)
// [ ] TODO: make it clearer wtf transientProperties are (rename?)
// [x] TODO: remove allowSelfTransitions entirely

/**
 * State machine for the Hero Image Rotator.
 */
var heroImageRotator = new StateMachine({
    onUncaughtException: logError,
    onExit: printExiting,
    start: 'idle',
    events: ['stop', 'rotate', 'wait'],
    transientProperties: [
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
            events: ['loaded', 'doneWaiting'],
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
 * @param [data]
 * @param [data.imageSources]
 */
function rotateIfWeHaveNewImages(idleState, data) {
    console.log('HeroImageRotator: idle');
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
function updateImagesAndStopIfWeHaveNone(activeState, data) {
    // take any new images
    if (data && typeof data === 'object' && 'imageSources' in data) {
        activeState.setProperty('areImagesLoaded', false);
        activeState.setProperty('imageSources', data.imageSources);
        activeState.setProperty('idxCurrentImage', 0);
    }

    // jump back to idle if we don't have any images
    var imageSources = activeState.getProperty('imageSources');
    if (!Array.isArray(imageSources) || imageSources.length === 0) {
        activeState.fireEvent('stop');
        return;
    }
}

/**
 * Pretends to load all of the image sources we've got.
 *
 * @param {State} loadingState
 * @param {Object} [data]
 */
function loadImages(loadingState, data) {
    // skip the loading state if we've already loaded our images
    if (loadingState.getProperty('areImagesLoaded')) {
        loadingState.fireEvent('loaded', data);
        return;
    }

    var imageSources = loadingState.getProperty('imageSources');
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
                loadingState.setProperty('areImagesLoaded', true);
                loadingState.fireEvent('loaded', data);
            }
        });
}

/**
 * Starts rotating between the loaded images from the rotating state.
 *
 * @param {State} rotatingState
 * @param {Object} [data]
 * @param {Number} [data.interval] Interval between showing images
 */
function rotateImages(rotatingState, data) {
    console.log('HeroImageRotator: rotating');

    // show first image
    var imageSources = rotatingState.getProperty('imageSources');
    var idxCurrentImage = rotatingState.getProperty('idxCurrentImage');
    console.log('HeroImageRotator: showing image', imageSources[idxCurrentImage]);

    // show the other images on an interval
    if (data && typeof data === 'object' && 'interval' in data) {
        rotatingState.setProperty('rotationInterval', data.interval);
    }
    var interval = rotatingState.getProperty('rotationInterval') || 2000;

    Rx.Observable.interval(interval)
        .takeUntil(rotatingState.exits)
        .map(function() {
            return rotatingState.getProperty('idxCurrentImage');
        })
        .subscribe(function(idxLast) {
            var idx = (idxLast + 1) % imageSources.length;
            rotatingState.setProperty('idxCurrentImage', idx);
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
 * @param {Object} [data]
 * @param {Number} [data.duration]
 */
function wait(waitingState, data) {
    // ignore negative or falsy durations
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
