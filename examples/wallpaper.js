var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

/**
 * State machine for the Hero Image Rotator.
 */
var heroImageRotator = new StateMachine({
    start: 'idle',
    events: ['stop', 'rotate', 'pause'],
    allowSelfTransitions: true,
    transitions: [
        { event: 'stop', to: 'idle' },
        { event: 'rotate', to: 'active' }
    ],
    onUncaughtException: function(heroImageRotator, error) {
        console.error('ERROR:', error);
    },
    transientProperties: ['imageSources', 'idxImage', 'isLoaded', 'interval'],
    states: {
        'idle': { onEnter: activateIfNecessary },
        'active': {
            start: 'loading',
            states: {
                'loading': { onEnter: loadImages },
                'rotating': { onEnter: rotateImages },
                'paused': { onEnter: pause }
            },
            events: ['loaded', 'doneWaiting'],
            allowSelfTransitions: true,
            transitions: [
                { event: 'pause', from: 'rotating', to: 'paused' },
                { event: 'pause', from: 'paused', to: 'paused' },
                { event: 'loaded', from: 'loading', to: 'rotating' },
                { event: 'doneWaiting', from: 'paused', to: 'rotating' },
            ],
            onEnter: function(activeState, data) {
                // take any new image sources
                if (data && typeof data === 'object' && 'imageSources' in data) {
                    activeState.setProperty('isLoaded', false);
                    activeState.setProperty('imageSources', data.imageSources);
                    activeState.setProperty('idxImage', 0);
                }

                // jump back to idle if we don't have any image sources
                var imageSources = activeState.getProperty('imageSources');
                if (!Array.isArray(imageSources) || imageSources.length === 0) {
                    activeState.fireEvent('stop');
                    return;
                }

                // skip the loading state if we've already loaded our images
                if (activeState.getProperty('isLoaded')) {
                    activeState.transition('rotating');
                }
            },
        }
    }
});

/**
 * If we've got new image sources, start rotating with those, otherwise chill here.
 *
 * @para {State} idleState
 * @param [data]
 * @param [data.imageSources]
 */
function activateIfNecessary(idleState, data) {
    console.log('HeroImageRotator: idle');
    if (data && data.imageSources) {
        idleState.fireEvent('rotate', data);
    }
}

/**
 * Pretends to load all of the image sources we've got.
 *
 * @param {State} loadingState
 * @param {Object} [data]
 */
function loadImages(loadingState, data) {
    var imageSources = loadingState.getProperty('imageSources');
    console.log('HeroImageRotator: loading', imageSources.length, 'images');

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
                loadingState.setProperty('isLoaded', true);
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
    var idxImage = rotatingState.getProperty('idxImage');
    console.log('HeroImageRotator: showing image', imageSources[idxImage]);

    // show the other images on an interval
    if (data && data.interval) {
        rotatingState.setProperty('interval', data.interval);
    }
    var interval = rotatingState.getProperty('interval') || 2000;
    Rx.Observable.interval(interval)
        .takeUntil(rotatingState.exits)
        .map(function() {
            return rotatingState.getProperty('idxImage');
        })
        .subscribe(function(idxLast) {
            var idx = (idxLast + 1) % imageSources.length;
            rotatingState.setProperty('idxImage', idx);
            console.log('HeroImageRotator: showing image', imageSources[idx]);
        });
}

/**
 * Waits for a specified duration before returning to rotation.
 *
 * Negative or falsy duration causes an immediate return to rotating state.
 * Infinity duration stays in this state until told otherwise.
 * Positive duration pauses here for the specified number of milliseconds.
 *
 * @param {State} pausedState
 * @param {Object} [data]
 * @param {Number} [data.duration]
 */
function pause(pausedState, data) {
    // ignore negative or falsy durations
    if (!data || !data.duration || data.duration <= 0) {
        console.log('HeroImageRotator: no pause duration, skipping');
        pausedState.fireEvent('doneWaiting');
        return;
    }

    // stay here until told otherwise for Infinity durations
    if (data.duration === Infinity) {
        console.log('HeroImageRotator: paused until we\'re told to resume');
        return;
    }

    // pause then go back to rotating for positive durations
    console.log('HeroImageRotator: paused', data.duration, 'ms');
    Rx.Observable.timer(data.duration)
        .takeUntil(pausedState.exits)
        .subscribe(function() {
            pausedState.fireEvent('doneWaiting');
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
    heroImageRotator.fireEvent('pause', {
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
    if (key === 'f') fireWaitEvent(Infinity);
    else fireWaitEvent(~~(Math.random()*2000));
});
