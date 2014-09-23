var StateMachine = require('../StateMachine');
var Rx = require('rx');

function timer(state, duration) {
    return Rx.Observable.timer(duration).takeUntil(state.exits);
}
function interval(state, duration) {
    return Rx.Observable.interval(duration).takeUntil(state.exits);
}

var playerUi = new StateMachine({
    start: 'idle',
    events: ['play', 'stop', '_playbackStarted', '_playbackStopped'],
    transitions: [
        { event: 'play', from: 'idle', to: 'loading' },
        { event: 'play', from: 'loading', to: 'idle' },
        { event: 'play', from: 'playing', handler: function stopCurrent(state, data) {
            state.fireEvent('stop', {
                stopping: state.currentData,
                storeBookmark: true,
                next: data
            });
        } },
        { event: 'play', from: 'stopping', handler: function queuePlay(stoppingState, data) {
            console.log('got play event for ' + data.id + ', deferring');
            stoppingState.nextData = data; // don't transition yet but schedule us to be next
        } },
        { event: 'stop', to: 'stopping' },
        { event: '_playbackStarted', from: 'loading', to: 'playing' },
        { event: '_playbackStopped', from: 'stopping', to: 'idle' }
    ],
    states: {
        idle: {
            onEnter: function(state, data) {
                if (data && data.error) {
                    console.log('found error!', data.error);
                    if (data.next) {
                        console.log('ignoring deferred play for video', data.next.id);
                    }
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
                        data.checkMark = true;
                        verifyingState.fireEvent('dataVerified', data)
                    }
                },
                starting: {
                    onEnter: function(startingState, data) {
                        console.log('starting video ' + data.id + '...');
                        timer(startingState, 500)
                            .subscribe(function() {
                                console.log('started playback for video', data.id);
                                startingState.fireEvent('_playbackStarted', data);
                            });
                    }
                }
            }
        },
        playing: {
            onEnter: function(playingState, data) {
                playingState.currentData = data;
                // heartbeat
                interval(playingState, 1000)
                    .subscribe(function() {
                        console.log('... still playing video', data.id);
                    });
                // time out playback
                timer(playingState, 3500)
                    .subscribe(function() {
                        playingState.fireEvent('stop', {
                            error: data.error,
                            stopping: playingState.currentData,
                            storeBookmark: true
                        });
                    });
            }
        },
        stopping: {
            onEnter: function(stoppingState, data) {
                stoppingState.nextData = data.next;
                console.log('stopping video', data.stopping.id);
                timer(stoppingState, 500)
                    .subscribe(function() {
                        if (data.storeBookmark) {
                            console.log('storing bookmark for video ' + data.stopping.id);
                        }
                        stoppingState.fireEvent('_playbackStopped', {
                            error: data.error,
                            next: stoppingState.nextData
                        });
                    });
            }
        }
    }
});

// TODO: debug mode showing all transitions (including nested)
// TODO: private vs public event scoping (use .toObservable)
// TODO: why did this.getEvent work ??!?!
// TODO: getEvent should no longer be a subject, should have a takeUntil
// TODO: add readEvent and writeEvent instead
// TODO: add predicate for transitions (both string and function-based)
// TODO: add handler instead of to for transitions
// TODO: add functions for to property (selector) for transitions
// TODO: add eventHandlers
// TODO: how do we deal with currentData ???
// TODO: properties array (e.g. ['current', 'next']) for backchannel / mutable state ?

// Look at GALLERY_SIGNALS

// HARD THINGS NEXT:
// [x] Play event while loading
// [x] Play event while playing
// [x] Play event while stopping
// [x] Adding errors everywhere
// [ ] Post-play scenario (stop in playback, goes to post-play)

playerUi.transitions
    .subscribe(function(data) {
        console.log('-> ' + data.to);
    });

// interrupt the next stopping playback
playerUi.transitions
    .where(function(data) { return data.to === 'stopping' })
    .delay(100)
    .take(1)
    .subscribe(function() {
        // fire a play event
        playerUi.fireEvent('play', {
            id: 4567,
            error: 'your car is on fire!'
        });
        // after our play starts and finishes, shut down
        playerUi.transitions
            .where(function(data) { return data.to === 'playing' })
            .take(1)
            .selectMany(function() {
                return playerUi.transitions
                    .where(function(data) { return data.to === 'idle' })
                    .take(1);
            })
            .delay(0)
            .subscribe(function() {
                console.log('finished!');
                playerUi.exit();
            })
    })

playerUi.enter();
playerUi.fireEvent('play', { id: 1234 })

