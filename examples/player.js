var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

/**
 * Controls the player UI.
 */
var playerUiFsm = new StateMachine({
    start: 'idle',
    onUncaughtException: resetToIdle,
    inputEvents: ['play', 'stop'],
    outputEvents: ['playbackStarted', 'playbackStopped'],
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
            internalEvents: ['downloadComplete', 'dataVerified'],
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
            transientData: ['currentVideo'],
            onEnter: startHeartbeat,
            eventHandlers: { 'play': stopPlayingVideoThenPlayAgain },
        },
        'stopping': {
            transientData: ['nextVideo'],
            onEnter: stopVideo,
            eventHandlers: { 'play': setNextVideo },
        }
    }
});

/**
 * On an uncaught exception, turn everything off and on again.
 */
function resetToIdle(player, context) {
    context.stopPropagation();
    console.log('[EXCEPTION]', context.error);
    player.exit();
    player.enter();
}

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
        stopping: playingState.getData('currentVideo'),
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
    Rx.Observable.timer(500)
        .takeUntil(downloadingState.exits)
        .doAction(function downloadComplete() {
            console.log('download complete');
            data.percentDone = 90;
            downloadingState.fireEvent('downloadComplete', data);
        })
        .subscribe(NOOP, downloadingState.onError);
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
    Rx.Observable.timer(500)
        .takeUntil(startingState.exits)
        .doAction(function() {
            console.log('started playback for video', data.id);
            startingState.fireEvent('playbackStarted', data);
        })
        .subscribe(NOOP, startingState.onError);
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

    playingState.setData('currentVideo', video);

    // heartbeat
    Rx.Observable.interval(1000)
        .takeUntil(playingState.exits)
        .doAction(function() {
            console.log('... still playing video', video.id);
        })
        .subscribe(NOOP, playingState.onError);

    // time out playback
    Rx.Observable.timer(3500)
        .takeUntil(playingState.exits)
        .doAction(function() {
            playingState.fireEvent('stop', {
                storeBookmark: true,
                error: video && video.error,
                stopping: playingState.getData('currentVideo')
            });
        })
        .subscribe(NOOP, playingState.onError);
}

/**
 * @param {State} stoppingState
 * @param {Event} event
 * @param {Object} [event.data]  the video we want to play next
 */
function setNextVideo(stoppingState, event) {
    stoppingState.setData('nextVideo', event.data); // don't transition yet but schedule us to be next
}

/**
 * @param {State} stoppingState
 * @param {TransitionInfo} context
 * @param {Object} [context.stopping]
 * @param {Object} [context.stopping]
 */
function stopVideo(stoppingState, context) {
    var data = context.data;
    stoppingState.setData('nextVideo', data && data.next);

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
    Rx.Observable.timer(500)
        .takeUntil(stoppingState.exits)
        .doAction(function() {
            if (data.storeBookmark) {
                console.log('storing bookmark for video ' + currentVideo.id);
            }
            stoppingState.fireEvent('playbackStopped', {
                error: data.error,
                next: stoppingState.getData('nextVideo')
            });
        })
        .subscribe(NOOP, stoppingState.onError);
}

// [ ] TODO: debug mode showing all transitions (including nested)
// [ ] TODO: detect when my child StateMachine exits and start exiting too
// [-] TODO: add handler instead of to for transitions
// [ ] TODO: deal with transitions during event handlers
// [x] TODO: require properties to be explicitly declared in the scope they have (call them transientData)

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

playerUiFsm.getEvents('playbackStarted')
    .subscribe(function(video) {
        console.log('[EVENT] playbackStarted fired for video', video.id);
    });

playerUiFsm.getEvents('playbackStopped')
    .subscribe(function() {
        console.log('[EVENT] playbackStopped fired');
    });

playerUiFsm.enter();
playerUiFsm.fireEvent('play', { id: 123 });
onNextEnter('playing', interruptPlaying);

function onNextEnter(state, callback) {
    playerUiFsm.transitions
        .where(function(data) { return data.to === state; })
        .delay(0)
        .take(1)
        .subscribe(callback.bind(null, playerUiFsm));
}

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

