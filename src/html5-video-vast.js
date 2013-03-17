/* jshint sub:true */
/* global VASTAds, VASTAd, VASTLinear, VASTCompanion, VASTNonLinear */
/* global VASTCreative */

/**
 * Create a new VAST integration
 *
 * @class
 * @param debug
 */
function VASTAdPlayer(debug) {
    // TODO: Check that all of these are used
    this.requestSettings = {
        width: null,
        height: null,
        bitrate: null,
        insertionPointType: null,
        playbackPosition: null
    };
    this.unsentTrackingPoints = [];
    this.activeAd = null;
    this.adPlaying = false;
    this.adsEnabled = true;
    this.breaks = [];
    this.lastPlayedBreak = null;
    this.debug = !!debug;
    this.skipHandler = {
        start: null,
        end: null
    };
    this._playerState = {
        originalSrc: null,
        timeToResume: 0,
        ended: false
    };
    this.takeoverCallbacks = {
        onTakeover: null,
        onRelease: null
    };
    this._clickEvent = navigator.userAgent.match(/iPad/i) ? 'touchstart' : 'click';

    this._bindContextForCallbacks();
}

/**
 * Loads the VMAP resource at the given URL and schedules ads to be played
 * according to the resource
 *
 * TODO: Implement
 *
 * @param {string} url The VMAP url
 */
VASTAdPlayer.prototype.loadVMAP = function(url) {
};

/**
 * Loads the given VAST resource and schedules the contained ads to be played at
 * the given position
 *
 * TODO: Implement
 *
 * @param {string} position The positition to play the loaded ads at. Should be
 *                          one of start, end, HH:MM:SS or XX%
 * @param {string} url The VAST resource URL
 */
VASTAdPlayer.prototype.loadVAST = function(position, url) {
};

VASTAdPlayer.prototype.log = function log() {
    if (this.debug && console.log && console.log.apply) {
        console.log.apply(console, arguments);
    }
};

VASTAdPlayer.prototype.logError = function logError() {
    if (console.error && console.error.apply) {
        console.error.apply(console, arguments);
    } else {
        this.log.apply(arguments);
    }
};

/**
 * Set functions to be called when an ad starts, and when ads finish
 *
 * This should be used to handle the displaying of a skip button
 *
 * @param {function(adDuration : int)} onAdStarted Called whenever a new video ad is started
 * @param {function} onAdEnded Called when a series of ads has finished
 */
VASTAdPlayer.prototype.setSkipHandler = function setSkipHandler(onAdStarted, onAdEnded) {
    this.skipHandler.start = onAdStarted;
    this.skipHandler.end = onAdEnded;
};

/**
 * Set functions to be called when this plugin takes over and releases the player
 *
 * @param onRelease
 * @param onTakeover
 */
VASTAdPlayer.prototype.setTakeoverCallbacks = function setTakeoverCallbacks(onTakeover, onRelease) {
    this.takeoverCallbacks.onTakeover = onTakeover;
    this.takeoverCallbacks.onRelease = onRelease;
};

/**
 * Call this method to skip the currently playing ad
 */
VASTAdPlayer.prototype.skipCurrentAd = function skipCurrentAd() {
    this._showNextAd();
};

/**
 * Set whether ads are enabled
 *
 * @param {boolean} enabled Whether to enabled ads or not
 */
VASTAdPlayer.prototype.setAdsEnabled = function setAdsEnabled(enabled) {
    this.adsEnabled = enabled;
};

/**
 * Set or clear the function to call to display a companion banner
 *
 * The function will be passed the HTML of the companion banner (usually an iframe).
 * It will also receive the companion ad's zone ID, its width and its height.
 * This function MUST return true if the companion banner was successfully shown.
 *
 * If the argument to this function is not a function, the existing handler will be cleared
 *
 * @param {?function(VASTCompanion): boolean} companionHandlerCallback
 *   Function to call when companion banners are to be displayed.
 */
VASTAdPlayer.prototype.setCompanionHandler = function setCompanionHandler(companionHandlerCallback) {
    this.companionHandler = companionHandlerCallback;
};

/**
 * Callback for when a new ad break has been fetched
 *
 * @param {number} i Ad break index (not used)
 * @param {string} position Ad break position (% or HH:MM:SS)
 * @param {VASTAd} ad The VAST ad(s) to display for the given break
 */
VASTAdPlayer.prototype._onAdBreakFetched = function (i, position, ad) {
    var p = VASTCreative.prototype.timecodeFromString(position);
    if (p.indexOf('%') > -1) {
        p = parseInt(position, 10);
        if (this.player && this.player.duration) {
            p = p * this.player.duration / 100;
        } else {
            this.logError("VASTAdPlayer error: fractional position given, but video does not have duration");
            return;
        }
    }

    this.breaks.push({
        position: position,
        ad: ad
    });
    this.breaks.sort(function (a, b) {
        return a.position - b.position;
    });
};

/**
 * Give information about the environment for the ad
 *
 * @param {Number} width Width of the video frame
 * @param {Number} height Height of the video frame
 * @param {Number} [bitrate] The maximum bitrate (in Kbps) of the ad
 */
VASTAdPlayer.prototype.setVideoProperties = function setVideoProperties(width, height, bitrate) {
    this.requestSettings.width = width;
    this.requestSettings.height = height;
    this.requestSettings.bitrate = bitrate;
};

/**
 * Check if we need to show controls
 *
 * Most mobile devices has disabled autoplay, and need to have controls to
 * allow playback. Actual implementation of this method can be improved.
 *
 * @return {Boolean}
 */
VASTAdPlayer.prototype._needControls = function _needContols() {
    return navigator.userAgent.match(/iPad|iPod|iPhone|Android/);
};

/**
 * Make sure all functions that are used as callbacks have the right context bound.
 *
 * This has to be done outside of the _listen-method in order to allow unbinding
 * of events.
 */
VASTAdPlayer.prototype._bindContextForCallbacks = function _bindContextForCallbacks() {
    this._onAdPlay = this._onAdPlay.bind(this);
    this._onAdCanPlay = this._onAdCanPlay.bind(this);
    this._onAdClick = this._onAdClick.bind(this);
    this._onAdClickToResume = this._onAdClickToResume.bind(this);
    this._onAdTick = this._onAdTick.bind(this);
    this._showNextAd = this._showNextAd.bind(this);
    this._onAdError = this._onAdError.bind(this);
    this._checkForPreroll = this._checkForPreroll.bind(this);
    this._checkForMidroll = this._checkForMidroll.bind(this);
    this._checkForPostroll = this._checkForPostroll.bind(this);
    this._onVideoCanPlay = this._onVideoCanPlay.bind(this);
};

/**
 * Binds the given callback to the given event on the given element
 * The callback will have the same this context as the call to listen
 *
 * @param {Node} element The element to add a listener to
 * @param {string} event Event to add a listener for
 * @param {function} callback Event callback
 */
VASTAdPlayer.prototype._listen = function _listen(element, event, callback) {
    element.addEventListener(event, callback, false);
};

/**
 * Removes the given callback from the given event on the given element
 *
 * @param {Node} element The element to remove a listener from
 * @param {string} event Event to remove a listener for
 * @param {function} callback Event callback to remove
 */
VASTAdPlayer.prototype._unlisten = function _unlisten(element, event, callback) {
    element.removeEventListener(event, callback, false);
};

VASTAdPlayer.prototype._takeover = function _takeover() {
    this.log('take over player');
    this.player.controls = false;

    this._listen(this.player, 'play', this._onAdPlay);
    this._listen(this.player, this._clickEvent, this._onAdClick);
    this._listen(this.player, 'canplay', this._onAdCanPlay);
    this._listen(this.player, 'timeupdate', this._onAdTick);
    this._listen(this.player, 'ended', this._showNextAd);
    this._listen(this.player, 'error', this._onAdError);

    this._unlisten(this.player, 'canplay', this._onVideoCanPlay);
    this._unlisten(this.player, 'play', this._checkForPreroll);
    this._unlisten(this.player, 'timeupdate', this._checkForMidroll);
    this._unlisten(this.player, 'ended', this._checkForPostroll);

    if (typeof this.takeoverCallbacks.onTakeover === 'function') {
        this.takeoverCallbacks.onTakeover(this.player);
    }
};

VASTAdPlayer.prototype._release = function _release() {
    this.log('release player');
    this.player.controls = true;

    this._unlisten(this.player, 'play', this._onAdPlay);
    this._unlisten(this.player, this._clickEvent, this._onAdClick);
    this._unlisten(this.player, this._clickEvent, this._onAdClickToResume);
    this._unlisten(this.player, 'canplay', this._onAdCanPlay);
    this._unlisten(this.player, 'timeupdate', this._onAdTick);
    this._unlisten(this.player, 'ended', this._showNextAd);

    this._listen(this.player, 'canplay', this._onVideoCanPlay);
    this._listen(this.player, 'play', this._checkForPreroll);
    this._listen(this.player, 'timeupdate', this._checkForMidroll);
    this._listen(this.player, 'ended', this._checkForPostroll);

    if (typeof this.takeoverCallbacks.onRelease === 'function') {
        this.takeoverCallbacks.onRelease(this.player);
    }
};

/**
 * Show the next ad in the last received list of ads
 *
 * @param {VASTAd} [first] An initial ad if we're starting a new ad sequence
 * @return {boolean} Whether another ad was played or not
 */
VASTAdPlayer.prototype._showNextAd = function _showNextAd(first) {
    if (this.adVideo !== null && this.adPlaying) {
        this.activeAd.linear.track('complete', this.player.currentTime, this.adVideo.src);
    }

    if (first instanceof VASTAd) {
        this.activeAd = first;
    } else {
        this.activeAd = this.activeAd.getNextAd();
    }

    if (!this.adsEnabled || this.activeAd === null) {
        this.log('no more ads');

        if (typeof this.skipHandler.end === 'function') {
            this.skipHandler.end.call(this);
        }

        this._resumeOriginalVideo();
        return false;
    }

    if (!this.activeAd.hasData()) {
        // TODO: Track impression here?
        return this._showNextAd();
    }

    this.log('showing next ad');

    this.adVideo = null;

    if (this.activeAd.linear) {
        this.adVideo = this.activeAd.linear.getBestMedia(this.requestSettings);
        this.log('found linear', this.adVideo);
    }

    var companions = this.activeAd.getCompanions();

    for (var i = 0; i < companions.length; i++) {
        var c = companions[i];
        this.log('found companion', c);
        if (!this._showCompanionBanner(c)) {
            this.logError("VASTAdPlayer error: no way of displaying companion ad");
        }
    }
    // TODO: handle companionsRequired attribute

    if (!this.adVideo) {
        this.log("VASTAdPlayer warning: got ad without linear", this.activeAd);
        return this._showNextAd();
    }

    // TODO: Nonlinears

    this._playVideoAd();
    return true;
};

/**
 * Show the given companion banner by calling the companionHandler function
 *
 * @param {VASTCompanion} companion The companion banner to display
 * @return {boolean} Whether the companion banner was successfully shown
 */
VASTAdPlayer.prototype._showCompanionBanner = function _showCompanionBanner(companion) {
    this.log('show companion banner', companion);
    if (typeof this.companionHandler !== 'function') {
        return false;
    }

    if (this.companionHandler(companion)) {
        companion.track('creativeView');
        return true;
    }

    return false;
};

/**
 * Should be called if VASTAds encounters an error
 *
 * Will log an error message and resume normal video playback
 *
 * @param {string} message A message describing the error
 */
VASTAdPlayer.prototype._onVASTError = function _onVASTError(message) {
    this.logError('VASTAdPlayer error: ' + message);
    this._resumeOriginalVideo();
};

/**
 * Fetches and displays ads
 *
 * @param {string} insertionPoint The type of ad to fetch
 *      May be one of: start, position, end
 * @param {?VASTAd} ad The ad to run if already determined
 */
VASTAdPlayer.prototype._runAds = function _runAds(insertionPoint, ad) {
    this.player.pause();
    this._prepareAdPlayback();
    this.requestSettings.insertionPointType = insertionPoint;

    this.activeAd = null;
    switch (insertionPoint) {
        case 'start':
        case 'end':
            // TODO: Find start/end ad
            ad = null;
            break;
        case 'position':
            break;
    }
    // TODO: block until ad hasData?
    this._showNextAd(ad);
};

/**
 * Callback for tracking when an ad starts playing or resumes
 */
VASTAdPlayer.prototype._onAdPlay = function _onAdPlay() {
    if (!this.adPlaying) {
        this.log('ad started playing');
        this.activeAd.linear.track('start', 0, this.adVideo.src);
    } else {
        // resume
        this.log('ad resumed');
        this.activeAd.linear.track('resume', this.player.currentTime, this.adVideo.src);
    }

    this.adPlaying = true;
};

/**
 * Ad click handler
 *
 * @param {Event} e Click event
 */
VASTAdPlayer.prototype._onAdClick = function _onAdClick(e) {
    this.activeAd.linear.track('click');
    var url = this.activeAd.linear.getClickThrough();

    if (url) {
        this.log('ad click through to ' + url);
        window.open(url, '_blank');
    }

    this.player.controls = true;
    this.player.pause();

    this._unlisten(this.player, this._clickEvent, this._onAdClick);
    // This event will not fire on iPads, since we show controls after returning
    // @see http://apto.ma/ipadvideotouchevents
    this._listen(this.player, this._clickEvent, this._onAdClickToResume);

    e.preventDefault();
    return false;
};

/**
 * Track progress on ad playback
 */
VASTAdPlayer.prototype._onAdTick = function _onAdTick() {
    if (!(this.player && this.adVideo && this.adPlaying)) {
        this.log('Player or ad video not ready');
        return false;
    }

    var time = this.player.currentTime;
    var percent = time / this.adVideo.duration;

    for (var i = 0, l = this.unsentTrackingPoints.length; i < l; i++) {
        var p = this.unsentTrackingPoints[i]["offset"];
        var passed = false;
        if (typeof p === 'number') {
            passed = p >= time;
        }
        if (p.indexOf('%') > -1) {
            passed = parseInt(p, 10) >= percent;
        }
        if (passed) {
            this.activeAd.linear.track(this.unsentTrackingPoints[i]["event"], time, this.adVideo.src);
        }
    }

    return true;
};

/**
 * Store state of original player and prepare for ad playback
 *
 * @return {boolean} Whether player needed to be prepared
 */
VASTAdPlayer.prototype._prepareAdPlayback = function _prepareAdPlayback() {
    this.log('told to create ad player');
    if (this.adPlaying) {
        return false;
    }

    if (this.player) {
        this.log('actually created ad player');
        if (this._playerState.originalSrc !== null) {
            this.log('Player state has src set', this._playerState.originalSrc, this.player.currentSrc);
        }
        this._playerState.originalSrc = this.player.currentSrc;
        this._playerState.timeToResume = this.player.currentTime;
        this._playerState.ended = this.player.ended;

        this.log('saved state', this._playerState, this.player.currentTime);
        this._takeover();

        this.adPlaying = false;

        return true;
    }

    return false;
};

// TODO: Fix for VAST?
VASTAdPlayer.prototype._onAdError = function _onAdError(e) {
    if (e.target.error) {
        switch (e.target.error.code) {
            case e.target.error.MEDIA_ERR_ABORTED:
                this.logError('Ad playback aborted.');
                break;
            case e.target.error.MEDIA_ERR_NETWORK:
                this.logError('A network error caused the video download to fail part-way');
                break;
            case e.target.error.MEDIA_ERR_DECODE:
                this.logError('The video playback was aborted due to a corruption problem or because the video used features your browser did not support');
                break;
            case e.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                this.logError('The video could not be loaded, either because the server or network failed or because the format is not supported');
                break;
            default:
                this.logError('An unknown error occurred');
                break;
        }
    }

    this._showNextAd();
};

/**
 * Play the current video ad
 *
 * TODO: skipHandler should be called only after skipOffset if present?
 */
VASTAdPlayer.prototype._playVideoAd = function _playVideoAd() {
    this.log('playing ad', this.adVideo);
    this.unsentTrackingPoints = this.activeAd.linear.getTrackingPoints();

    if (typeof this.skipHandler.start === 'function') {
        this.skipHandler.start.call(this, this.adVideo.duration);
    }

    this.player.setAttribute('src', this.adVideo.src);
    this.player.load();
};

/**
 * Called when the ad has loaded and can be played
 */
VASTAdPlayer.prototype._onAdCanPlay = function _onAdCanPlay() {
    this.activeAd.linear.track('creativeView');
    this.player.play();
    this.player.currentTime = 0;
};

/**
 * Called when ad is clicked after clicktrough
 */
VASTAdPlayer.prototype._onAdClickToResume = function _onAdClickToResume() {
    this.log('-- click to resume');
    this.player.play();
};

/**
 * Called when the video has loaded and can be played
 */
VASTAdPlayer.prototype._onVideoCanPlay = function _onVideoCanPlay() {
    if (this._playerState.timeToResume === 0 || this._playerState.timeToResume === null) {
        this.player.play();
        return;
    }

    if (!this._playerState.isBuffering) {
        this.player.play();
    }

    if (this.player.seekable.length === 0 ||
        this.player.seekable.end(0) < this._playerState.timeToResume)
    {
        this.player.pause();
        this._playerState.isBuffering = true;
        setTimeout(this._onVideoCanPlay, 200);
        return;
    }

    this.player.currentTime = this._playerState.timeToResume;
    this.player.play();
    this._playerState.isBuffering = false;
    this._playerState.timeToResume = 0;
};

/**
 * Resumes normal video playback and releases event capturing
 */
VASTAdPlayer.prototype._resumeOriginalVideo = function _resumeOriginalVideo() {
    this.log('resuming watched player', this._playerState);
    if (this.player && !this._playerState.ended) {
        if (this.player.src === this._playerState.originalSrc || !this._playerState.originalSrc) {
            this.player.play();
        } else {
            this.player.src = this._playerState.originalSrc;
            this.player.load();
        }
    }
    this.adPlaying = false;
    this._release();

    if (this._playerState.ended) {
        this.player.autoplay = null;
        if (this.player.src !== this._playerState.originalSrc) {
            this.player.src = this._playerState.originalSrc;
        }
        this._triggerVideoEvent('ended');
    }
};

/**
 * Trigger an event with the given type on the currently watched player
 *
 * @see http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
 * @param {string} eType Event type to trigger
 */
VASTAdPlayer.prototype._triggerVideoEvent = function _triggerVideoEvent(eType) {
    if (!this.player) {
        return;
    }

    var event;
    event = document.createEvent('HTMLEvents');
    event.initEvent(eType, true, true);
    this.player.dispatchEvent(event);
};

/**
 * Shows a preroll if a preroll should be played
 */
VASTAdPlayer.prototype._checkForPreroll = function _checkForPreroll() {
    if (!this.hasShownPreroll) {
        this._runAds('start');
        this.hasShownPreroll = true;
    }
};

/**
 * Shows a midroll if a midroll should be played
 *
 * This is determined by looking through the list of midrolls (which is sorted),
 * and finding the latest timestamp which has been passed.
 * If the last midroll shown was not the one we last passed, then we
 * show that one.
 */
VASTAdPlayer.prototype._checkForMidroll = function _checkForMidroll() {
    if (this.adPlaying) {
        return false;
    }
    if (this.breaks.length === 0) {
        return false;
    }

    var potentialMidroll = null;
    for (var i = 0, l = this.breaks.length; i < l; i++) {
        if (this.breaks[i]["position"] > this.player.currentTime) {
            break;
        }
        potentialMidroll = i;
    }
    if (potentialMidroll !== null && potentialMidroll !== this.lastPlayedMidroll) {
        this.log('playing overdue midroll ' + potentialMidroll);
        this.lastPlayedMidroll = potentialMidroll;
        this._runAds('position', this.breaks[potentialMidroll]);

        return true;
    }

    return false;
};

/**
 * Shows a postroll if a postroll should be played
 */
VASTAdPlayer.prototype._checkForPostroll = function _checkForPostroll() {
    if (!this.hasShownPostroll) {
        this.hasShownPostroll = true;
        this._runAds('end');
    }
};

/**
 * Watch the given player, and inject ads when appropriate
 *
 * Will add two event listeners, one for play and one for ended.
 * This will trigger prerolls and postrolls respectively
 *
 * When an ad is played, the video element will be paused and hidden,
 * and an ad player with the dimension given to setVideoProperties will
 * be added before it in the DOM. When the ad(s) finish, the ad player
 * will be removed, and the video element will be made visible and
 * .play() will be called.
 *
 * @param {Node} videoElement The video element to watch
 * @return {boolean} False if videoElement is not a video element, true otherwise
 */
VASTAdPlayer.prototype.watchPlayer = function watchPlayer(videoElement) {
    this.log('told to watch player', videoElement);

    if (videoElement.tagName.toLowerCase() !== 'video') {
        this.logError('not watching player - not a video element');
        return false;
    }

    this.player = videoElement;
    this.hasShownPreroll = false;
    this.hasShownPostroll = false;

    if (!this.player.paused) {
        this._runAds('onBeforeContent');
        this.hasShownPreroll = true;
    }

    this._listen(this.player, 'play', this._checkForPreroll);
    this._listen(this.player, 'timeupdate', this._checkForMidroll);
    this._listen(this.player, 'ended', this._checkForPostroll);

    return true;
};

/**
 * lets you bind a function call to a scope
 */
if (typeof Function.prototype.bind === 'undefined') {
    Function.prototype.bind = function () {
        var __method = this, args = Array.prototype.slice.call(arguments), object = args.shift();
        return function () {
            var local_args = args.concat(Array.prototype.slice.call(arguments));
            if (this !== window) {
                local_args.push(this);
            }
            return __method.apply(object, local_args);
        };
    };
}
