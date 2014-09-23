var StateMachine = require('../StateMachine');
var Rx = require('rx');
function NOOP() {}

function timer(state, duration) {
    return Rx.Observable.timer(duration).takeUntil(state.exits);
}
function interval(state, duration) {
    return Rx.Observable.interval(duration).takeUntil(state.exits);
}

var playerUi = new StateMachine({
    start: 'idle',
    events: ['play', 'stop'],
    privateEvents: ['playbackStarted', 'playbackStopped', 'stopLoading'],
    transitions: [
        { event: 'stop', to: 'stopping' },
        { event: 'play', from: 'idle', to: 'loading' },
        { event: 'stopLoading', from: 'loading', to: 'idle' },
        { event: 'playbackStarted', from: 'loading', to: 'playing' },
        { event: 'playbackStopped', from: 'stopping', to: 'idle' }
    ],
    eventHandlers: [
        { state: 'playing', event: 'play', handler: function stopThenPlayAgain(playingState, nextVideo) {
            var currentVideo = playingState.getProperty('currentVideo');
            console.log('got play event for ' + nextVideo.id + ', stopping ' + currentVideo.id);
            playingState.fireEvent('stop', { storeBookmark: true, stopping: currentVideo, next: nextVideo });
        } },
        { state: 'loading', event: 'play', handler: function startPlay(loadingState, video) {
            console.log('got play event for ' + video.id + ', cancelling load');
            loadingState.fireEvent('stopLoading', { next: video });
        } },
        { state: 'stopping', event: 'play', handler: function queuePlay(stoppingState, video) {
            console.log('got play event for ' + video.id + ', deferring');
            stoppingState.setProperty('nextVideo', video); // don't transition yet but schedule us to be next
        } },
    ],
    states: {
        idle: {
            onEnter: function(state, data) {

                // handle errors
                if (data && data.error) {
                    console.log('found error!', data.error);
                    if (data.next) {
                        console.log('ignoring deferred play for video', data.next.id);
                    }

                // handle next video
                } else if (data && data.next) {
                    console.log('got deferred play for video', data.next.id);
                    state.fireEvent('play', data.next);
                }
            }
        },
        loading: {
            start: 'downloading',
            events: ['downloadComplete', 'dataVerified'],
            transitions: [
                { event: 'downloadComplete', from: 'downloading', to: 'verifying' },
                { event: 'dataVerified', from: 'verifying', to: 'starting' }
            ],
            states: {
                downloading: {
                    onEnter: function(downloadingState, data) {
                        console.log('downloading data for video ' + data.id + '...');

                        // download data
                        timer(downloadingState, 500)
                            .subscribe(function downloadComplete() {
                                console.log('download complete');
                                downloadingState.fireEvent('downloadComplete', data);
                            });
                    }
                },
                verifying: {
                    onEnter: function(verifyingState, data) {
                        console.log('verifying video', data.id);

                        // verify video
                        data.checkMark = true;
                        verifyingState.fireEvent('dataVerified', data)
                    }
                },
                starting: {
                    onEnter: function(startingState, data) {
                        console.log('starting video ' + data.id + '...');

                        // start playback
                        timer(startingState, 500)
                            .subscribe(function() {
                                console.log('started playback for video', data.id);
                                startingState.fireEvent('playbackStarted', data);
                            });
                    }
                }
            }
        },
        playing: {
            onEnter: function(playingState, video) {
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
        },
        stopping: {
            onEnter: function(stoppingState, data) {
                stoppingState.setProperty('nextVideo', data.next);

                var currentVideo = data.stopping;
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
        }
    }
});

// [ ] TODO: debug mode showing all transitions (including nested)
// [x] TODO: private vs public event scoping (use .toObservable)
// [x] TODO: why did this.getEvent work ??!?! (exceptions being swallowed)
// [ ] TODO: add readEvent and writeEvent instead
// [ ] TODO: readEvent should no longer be a subject, should have a takeUntil
// [ ] TODO: add predicate for transitions (both string and function-based)
// [ ] TODO: add functions for to property (selector) for transitions
// [x] TODO: add eventHandlers
// [ ] TODO: data transformations ???
// [x] TODO: deal with properties like nextVideo and currentVideo
// [ ] TODO: exception safety (onUncaughtException ??? going down w/ no way to stop it)
//   exits each state then calls its handler if any, handler can re-enter which cancels the bubbling
// [ ] TODO: detect when my child StateMachine exits and start exiting too
// [ ] TODO: add handler instead of to for transitions

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

function onNextEnter(state, callback, delay) {
    playerUi.transitions
        .where(function(data) { return data.to === state; })
        .delay(100)
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
