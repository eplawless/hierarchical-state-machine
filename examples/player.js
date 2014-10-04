var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

/**
 * Controls the player UI.
 */
var playerUiFsm = new StateMachine({
    start: 'idle',
    inputEvents: ['stop'],
    internalEvents: ['play', 'playbackStarted', 'playbackStopped'],
    eventHandlers: { 'play': logUnhandledPlayEvent },
    transitions: [
        { event: 'play', from: 'idle', to: 'loading' },
        { event: 'stop', from: 'loading', to: 'idle' },
        { event: 'stop', from: 'playing', to: 'stopping' },
        { event: 'playbackStarted', from: 'loading', to: 'playing' },
        { event: 'playbackStopped', from: 'stopping', to: 'idle' }
    ],
    states: {
        'idle': { onEnter: tryToLoadNextVideo },
        'loading': {
            start: 'downloading',
            inputEvents: ['downloadComplete', 'dataVerified'],
            eventHandlers: { 'play': stopLoadingThenPlay },
            transitions: [
                { event: 'downloadComplete', from: 'downloading', to: 'verifying' },
                { event: 'dataVerified', from: 'verifying', to: 'starting' }
            ],
            states: {
                'downloading': { onEnter: downloadVideo },
                'verifying': { onEnter: verifyVideo },
                'starting': { onEnter: startPlayingVideo }
            }
        },
        'playing': {
            transientProperties: ['currentVideo'],
            onEnter: startHeartbeat,
            eventHandlers: { 'play': stopPlayingVideoThenPlayAgain },
        },
        'stopping': {
            transientProperties: ['nextVideo'],
            onEnter: stopVideo,
            eventHandlers: { 'play': setNextVideo },
        }
    }
});

/**
 * Log any unhandled play event
 *
 * @param {State} playerUiFsm
 * @param {Event} event
 * @param {Object} [event.data]  the video we're trying to play
 * @param {Number} [event.data.id]  the id of the video we're trying to play
 */
function logUnhandledPlayEvent(playerUiFsm, event) {
    var video = event.data;
    console.log('WARNING: ignoring play event for video', video.id);
    event.propagate();
}

/**
 * If we don't have any errors, and we have a next video to play, try to play it.
 *
 * @param {State} idleState
 * @param {TransitionInfo} context
 * @param {Object} [context.data]
 * @param {?} [context.data.error]  the error which caused playback to stop
 * @param {Object} [context.data.next]  the next video to play
 */
function tryToLoadNextVideo(idleState, context) {
    // handle errors
    var data = context.data;
    if (data && data.error) {
        console.log('found error!', data.error);
        if (data.next) {
            console.log('ignoring deferred play for video', data.next.id);
        }

    // handle next video
    } else if (data && data.next) {
        console.log('got deferred play for video', data.next.id);
        idleState.fireEvent('play', data.next);
    }
}

/**
 * @param {State} loadingState
 * @param {Event} playEvent
 * @param {Object} [playEvent.data]  the video we're trying to play
 */
function stopLoadingThenPlay(loadingState, playEvent) {
    var video = playEvent.data;
    loadingState.fireEvent('stop', { next: video });
}

/**
 * @param {State} playingState
 * @param {Event} playEvent
 * @param {Object} [playEvent.data]  the next video to play
 */
function stopPlayingVideoThenPlayAgain(playingState, playEvent) {
    var nextVideo = playEvent.data;
    playingState.fireEvent('stop', {
        storeBookmark: true,
        stopping: playingState.getProperty('currentVideo'),
        next: nextVideo
    });
}

/**
 * @param {State} downloadingState
 * @param {TransitionInfo} context
 * @param {Object} context.data  the video we're loading
 */
function downloadVideo(downloadingState, context) {
    var data = context.data;
    console.log('downloading data for video ' + data.id + '...');

    // download data
    timer(downloadingState, 500)
        .subscribe(function downloadComplete() {
            console.log('download complete');
            data.percentDone = 90;
            downloadingState.fireEvent('downloadComplete', data);
        });
}

/**
 * @param {State} verifyingState
 * @param {TransitionInfo} context
 * @param {Object} context.data  the video we're verifying
 */
function verifyVideo(verifyingState, context) {
    var data = context.data;
    console.log('verifying video', data.id);

    // verify video
    data.verified = true;
    verifyingState.fireEvent('dataVerified', data)
}

/**
 * @param {State} startingState
 * @param {TransitionInfo} context
 * @param {Object} context.data  the video we're going to play
 */
function startPlayingVideo(startingState, context) {
    var data = context.data;
    console.log('starting video ' + data.id + '...');

    // start playback
    timer(startingState, 500)
        .subscribe(function() {
            console.log('started playback for video', data.id);
            startingState.fireEvent('playbackStarted', data);
        });
}

/**
 * @param {State} playingState
 * @param {TransitionInfo} context
 * @param {Object} [context.data]  the video we think is playing
 * @param {Object} [context.data.error]  somehow the video has an error on it??
 */
function startHeartbeat(playingState, context) {
    var video = context.data;
    if (!video) {
        console.log('trying to start a heartbeat for a nonexistent video, stopping');
        playingState.fireEvent('stop');
        return;
    }

    playingState.setProperty('currentVideo', video);

    // heartbeat
    interval(playingState, 1000)
        .subscribe(function() {
            console.log('... still playing video', video.id);
        });

    // time out playback
    timer(playingState, 3500)
        .subscribe(function() {
            var eventData = { storeBookmark: true };
            var error = video && video.error;
            if (error) eventData.error = error;
            var currentVideo = playingState.getProperty('currentVideo');
            if (currentVideo) eventData.stopping = currentVideo;
            playingState.fireEvent('stop', eventData);
        });
}

/**
 * @param {State} stoppingState
 * @param {Event} event
 * @param {Object} [event.data]  the video we want to play next
 */
function setNextVideo(stoppingState, event) {
    stoppingState.setProperty('nextVideo', event.data); // don't transition yet but schedule us to be next
}

/**
 * @param {State} stoppingState
 * @param {TransitionInfo} context
 * @param {Object} [context.stopping]
 * @param {Object} [context.stopping]
 */
function stopVideo(stoppingState, context) {
    var data = context.data;
    stoppingState.setProperty('nextVideo', data && data.next);

    var currentVideo = data && data.stopping;
    if (!currentVideo) {
        stoppingState.fireEvent('playbackStopped', {
            error: data && data.error,
            next: data && data.next
        });
        return;
    }

    console.log('stopping video', currentVideo.id);

    // stop video
    timer(stoppingState, 500)
        .subscribe(function() {
            if (data.storeBookmark) {
                console.log('storing bookmark for video ' + currentVideo.id);
            }
            stoppingState.fireEvent('playbackStopped', {
                error: data.error,
                next: stoppingState.getProperty('nextVideo')
            });
        });
}

function timer(state, duration) {
    return Rx.Observable.timer(duration).takeUntil(state.exits);
}
function interval(state, duration) {
    return Rx.Observable.interval(duration).takeUntil(state.exits);
}

// [ ] TODO: debug mode showing all transitions (including nested)
// [x] TODO: private vs public event scoping (use .toObservable)
// [x] TODO: why did this.getEvent work ??!?! (exceptions being swallowed)
// [ ] TODO: add readEvent and writeEvent instead
// [ ] TODO: readEvent should no longer be a subject, should have a takeUntil
// [ ] TODO: add predicate for transitions (both string and function-based)
// [-] TODO: add functions for to property (selector) for transitions
// [x] TODO: add eventHandlers
// [ ] TODO: data transformations ???
// [x] TODO: deal with properties like nextVideo and currentVideo
// [ ] TODO: exception safety (onUncaughtException ??? going down w/ no way to stop it)
//   exits each state then calls its handler if any, handler can re-enter which cancels the bubbling
// [ ] TODO: detect when my child StateMachine exits and start exiting too
// [-] TODO: add handler instead of to for transitions
// [ ] TODO: deal with transitions during event handlers
// [x] TODO: require properties to be explicitly declared in the scope they have (call them transientProperties)

// HARD THINGS NEXT:
// [x] Play event while loading
// [x] Play event while playing
// [x] Play event while stopping
// [x] Adding errors everywhere
// [ ] Post-play scenario (stop in playback, goes to post-play)

playerUiFsm.transitions
    .subscribe(function(info) {
        console.log('[TRANSITION]', info.from, '->', info.to, '(', info.data, ')');
    });

function onNextEnter(state, callback) {
    playerUiFsm.transitions
        .where(function(data) { return data.to === state; })
        .delay(0)
        .take(1)
        .subscribe(callback.bind(null, playerUiFsm));
}

playerUiFsm.enter();
playerUiFsm.fireEvent('play', { id: 123 });
onNextEnter('playing', interruptPlaying);

function interruptPlaying() {
    console.log('~> interrupting playing!');
    playerUiFsm.fireEvent('play', { id: 456 });
    onNextEnter('loading', interruptLoading);
}

function interruptLoading() {
    console.log('~> interrupting loading!');
    playerUiFsm.fireEvent('play', { id: 789 });
    onNextEnter('stopping', interruptStopping);
}

function interruptStopping() {
    console.log('~> interrupting stopping!');
    playerUiFsm.fireEvent('play', { id: 101112 });
    onNextEnter('playing', function() {
        onNextEnter('idle', function() {
            console.log('~> finished!')
            playerUiFsm.exit();
        })
    })
}

