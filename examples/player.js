var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

var playerUi = new StateMachine({
    start: 'idle',
    events: ['play', 'stop'],
    privateEvents: ['playbackStarted', 'playbackStopped'],
    eventHandlers: { 'play': logPlayEvent },
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
            events: ['downloadComplete', 'dataVerified'],
            eventHandlers: { 'play': stopLoadingThenPlay },
            transitions: [
                { event: 'downloadComplete', from: 'downloading', to: 'verifying' },
                { event: 'dataVerified', from: 'verifying', to: 'starting' }
            ],
            states: {
                'downloading': { onEnter: downloadVideo },
                'verifying': { onEnter: verifyVideo },
                'starting': { onEnter: startVideo }
            }
        },
        'playing': {
            transientProperties: ['currentVideo'],
            eventHandlers: { 'play': stopPlayingVideoThenPlayAgain },
            onEnter: startHeartbeat
        },
        'stopping': {
            transientProperties: ['nextVideo'],
            eventHandlers: { 'play': setNextVideo },
            onEnter: stopVideo
        }
    }
});

/**
 *
 */
function logPlayEvent(playerUi, event) {
    var video = event.data;
    console.log('got play event for video', video.id);
    event.propagate();
}

/**
 *
 */
function tryToLoadNextVideo(idleState, data) {
    // handle errors
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
 *
 */
function stopLoadingThenPlay(loadingState, event) {
    var video = event.data;
    loadingState.fireEvent('stop', { next: video });
}

/**
 *
 */
function stopPlayingVideoThenPlayAgain(playingState, event) {
    var nextVideo = event.data;
    playingState.fireEvent('stop', {
        storeBookmark: true,
        stopping: playingState.getProperty('currentVideo'),
        next: nextVideo
    });
}

/**
 *
 */
function downloadVideo(downloadingState, data) {
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
 *
 */
function verifyVideo(verifyingState, data) {
    console.log('verifying video', data.id);

    // verify video
    data.verified = true;
    verifyingState.fireEvent('dataVerified', data)
}

/**
 *
 */
function startVideo(startingState, data) {
    console.log('starting video ' + data.id + '...');

    // start playback
    timer(startingState, 500)
        .subscribe(function() {
            console.log('started playback for video', data.id);
            startingState.fireEvent('playbackStarted', data);
        });
}

/**
 *
 */
function startHeartbeat(playingState, video) {
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
            playingState.fireEvent('stop', {
                error: video.error,
                stopping: playingState.getProperty('currentVideo'),
                storeBookmark: true
            });
        });
}

/**
 *
 */
function setNextVideo(stoppingState, event) {
    var video = event.data;
    stoppingState.setProperty('nextVideo', video); // don't transition yet but schedule us to be next
}

/**
 *
 */
function stopVideo(stoppingState, data) {
    stoppingState.setProperty('nextVideo', data && data.next);

    var currentVideo = data && data.stopping;
    if (!currentVideo) {
        stoppingState.fireEvent('playbackStopped');
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

playerUi.transitions
    .subscribe(function(data) {
        console.log('[', data.from + ' -> ' + data.to, ']');
    });

function onNextEnter(state, callback) {
    playerUi.transitions
        .where(function(data) { return data.to === state; })
        .delay(0)
        .take(1)
        .doAction(callback.bind(null, playerUi))
        .subscribe(NOOP);
}

playerUi.enter();
playerUi.fireEvent('play', { id: 123 });
onNextEnter('playing', interruptPlaying);

function interruptPlaying() {
    console.log('~> interrupting playing!');
    playerUi.fireEvent('play', { id: 456 });
    onNextEnter('loading', interruptLoading);
}

function interruptLoading() {
    console.log('~> interrupting loading!');
    playerUi.fireEvent('play', { id: 789 });
    onNextEnter('stopping', interruptStopping);
}

function interruptStopping() {
    console.log('~> interrupting stopping!');
    playerUi.fireEvent('play', { id: 101112 });
    onNextEnter('playing', function() {
        onNextEnter('idle', function() {
            console.log('~> finished!')
            playerUi.exit();
        })
    })
}

