'use strict';
/*
 * The actual engine which does the hard work
 */

// resources:
//  * http://creativejs.com/resources/web-audio-api-getting-started/
//  * http://www.w3.org/TR/webaudio/ (this one is recommended as there is no good documentation as of feb 2013)

var VERIFY_DATA_INTERVAL = 20000;

function Abx () {
	this.sampleName = null;
	this.codecName = null;
	this.bitrateName = null;

	if (typeof AudioContext !== "undefined") {
		this.context = new AudioContext();
	} else {
		setStatus('Web Audio API not supported. The latest versions of Firefox and Chrome should work.');
	}

	this.spinner = new ProgressSpinner('progressbar', document.getElementById('progressbar'));
	this.spinner.onclick = function (relpos) {
		this.setPosition(relpos*this.duration);
	}.bind(this);

	this.init();
}


Abx.prototype.logHeader = function () {
	log.log('WebABX log (http://webabx.nfshost.com/)')
	log.log('date:   '+time(true));
	log.log('file A: ' + ralign(filesize(this.sources.a.filesize), 6) + '  '
			+ ralign(bitrate(this.sources.a), 9) + '   ' + this.sources.a.fullname);
	log.log('file B: ' + ralign(filesize(this.sources.b.filesize), 6) + '  '
			+ ralign(bitrate(this.sources.b), 9) + '   ' + this.sources.b.fullname);
	log.log(''); // empty line / whitespace
}


// the time before music of both tracks is started
// I think this is needed so they both start at exactly the same time
// (although, the difference usually seems to be around 0ms, which shouldn't
// be audible)
Abx.prototype.latency = 0.010; // 10ms

Abx.prototype.init = function () {
	// Firefox may keep some text in the log on reload
	log.clear();

	// how many sources are loaded (should equal 2 when ready)
	this.loadedSources = 0;

	// all sources are loaded and ready to be played
	this.ready   = false;

	// there is a track currently playing
	this.playing = false;

	// define sources
	this.sources = {'a': {name:'a'},
	                'b': {name:'b'}};

	// current source. Has always a value, but is not always the currently
	// playing (it may be stopped or paused).
	this.sourceName = 'a';

	// time calculations. All are floats in seconds, based on
	// AudioContext.currentTime.
	// These two offsets describe the played range. The player should never go
	// beyond these offsets.
	this.startOffset  = 0;
	this.endOffset    = 0; // endOffset = track duration - end track position
	// offset in the track relative to startOffset.
	// Only valid while paused (not playing).
	this.pauseOffset = 0;
	// when playing, this is the time (based on AudioContext.currentTime) when
	// this track started had it been played from the start.
	this.virtualStartOffset = 0;

	// statistics
	this.guessTotal = 0; // total rounds
	this.guessRight = 0; // right-guessed rounds
}

Abx.prototype.loadFiles = function () {
	var input  = document.querySelector('#fileinput');
	var input2 = document.querySelector('#fileinput2');
	var files = input.files;

	if (files.length != 2) {
		if (input.files.length + input2.files.length == 2) {
			files = [input.files[0], input2.files[0]];
		} else if (input.files.length == 1 && input2.style.display == 'none') {
			input2.style.display = '';
			input.removeAttribute('multiple');
			return;
		} else {
			setStatus('select two files to ABX');
			return;
		}
	}

	// A will have the biggest file size. Thus most likely the highest quality file.
	if (files[0].size >= files[1].size) {
		var file_a = files[0];
		var file_b = files[1];
	} else {
		var file_a = files[1];
		var file_b = files[0];
	}

	// unload other sources etc.
	this.unload();

	// get blob urls
	this.sources.a.url = URL.createObjectURL(file_a);
	this.sources.b.url = URL.createObjectURL(file_b);

	// full name and filesize are useful later on, the rest may be garbage collected
	this.sources.a.fullname = file_a.name;
	this.sources.b.fullname = file_b.name;
	this.sources.a.filesize = file_a.size;
	this.sources.b.filesize = file_b.size;

	// don't upload more files during parsing
	input.disabled  = true;
	input2.disabled = true;

	this.load();
}


// call specific for this testing round
Abx.prototype.load = function () {
	if (this.ready) {
		throw 'Has already been loaded';
	}

	// start spinner
	this.spinner.setStatus('loading...');
	setStatus('loading...');

	this.loadSources();
}

Abx.prototype.loadSampleIndex = function (url, sampleBase, samplesForm) {
	this.sampleBaseUrl = sampleBase;
	this.samplesForm = samplesForm;

	var request = new XMLHttpRequest();
	request.open("GET", url, true);
	request.onload = function () {
		console.log('loaded samples index')
		this.sampleIndex = JSON.parse(request.response);

		for (var sampleName in this.sampleIndex) {
			var sample = this.sampleIndex[sampleName].encoded;
			for (var codecName in sample) {
				var codec = sample[codecName];
				for (var bitrateName in codec) {
					var bitrate = codec[bitrateName];
					if (bitrate.verifyData) {
						bitrate.verifyData = readFloat32Array(bitrate.verifyData);
					}
				}
			}
		}

		this.setSampleSelect('name', this.sampleIndex);
		this.onSampleNameChange();
	}.bind(this);
	request.onerror = function (e) {
		console.error(e);
	}.bind(this);
	request.send();
}

Abx.prototype.onSampleNameChange = function () {
	var sampleName = this.getSampleSelect('name');
	if (sampleName != this.sampleName) {
		this.sampleName = sampleName;
		this.setSampleSelect('codec', this.sampleIndex[sampleName].encoded, this.sampleCodec);
		this.onSampleCodecChange();
	}
}

Abx.prototype.onSampleCodecChange = function () {
	var sampleName = this.getSampleSelect('name')
	var codecName = this.getSampleSelect('codec')
	var codec = this.sampleName + '-' + codecName;
	if (codec != this.sampleCodec) {
		this.sampleCodec = codec;
		this.setSampleSelect('bitrate', this.sampleIndex[sampleName].encoded[codecName], this.sampleBitrate);
		this.onSampleBitrateChange();
	}
}

Abx.prototype.onSampleBitrateChange = function() {
	this.unload();

	var sampleName = this.getSampleSelect('name')
	var codecName = this.getSampleSelect('codec')
	var bitrateName = this.getSampleSelect('bitrate')

	var name = sampleName + '-' + codecName + '-' + bitrateName;

	this.sources.a.fullname = this.sampleIndex[sampleName].original.name;
	this.sources.a.filesize = this.sampleIndex[sampleName].original.filesize;
	this.sources.a.bitrate = 'lossless';
	this.sources.a.url = this.sampleBaseUrl + this.sampleIndex[sampleName].original.name;
	this.sources.a.sample = this.sampleIndex[sampleName].original;
	this.sources.b.fullname = this.sampleIndex[sampleName].encoded[codecName][bitrateName].name;
	this.sources.b.filesize = this.sampleIndex[sampleName].encoded[codecName][bitrateName].filesize;
	this.sources.b.bitrate = bitrateName+'kbps';
	this.sources.b.url = this.sampleBaseUrl + this.sampleIndex[sampleName].encoded[codecName][bitrateName].name;
	this.sources.b.sample = this.sampleIndex[sampleName].encoded[codecName][bitrateName];

	this.load();
}

Abx.prototype.getSampleSelect = function (selectName) {
	return this.samplesForm.querySelector('#sample-' + selectName).value;
}

Abx.prototype.setSampleSelect = function (selectName, dict, selected) {
	var select = this.samplesForm.querySelector('#sample-' + selectName);
	select.innerHTML = '';

	var keys = Object.keys(dict);
	keys.sort();
	for (var i=0; i<keys.length; i++) {
		var option = document.createElement('option');
		option.textContent = keys[i];
		option.value = keys[i];
		select.appendChild(option);
	}
}

// when audio data has been loaded
Abx.prototype.onLoad = function () {
	// start log
	this.logHeader();

	var difference = Math.abs(this.sources.a.soundBuffer.length-this.sources.b.soundBuffer.length);
	if (difference) {
		// Difference > 1 to temporarily work around a FireFox bug, see:
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1129355
		// Log this, because it may screw results (it might theoretically be
		// heard thus it might be possible to know which is which).
		log.log('WARNING: there is a difference in length between tracks ('+difference+' samples)');
	}

	if (this.sources.a.sample && this.sources.a.sample.samples !== this.sources.a.soundBuffer.length) {
		console.log(this.sources.a.sample, this.sources.a.soundBuffer);
		throw 'first source (WAV file?) does not have the right amount of samples';
	}

	if (difference > 0 && this.sources.b.sample && this.sources.b.sample.verifyData) {
		var verifyData = this.sources.b.sample.verifyData;
		var soundBuffer = this.sources.b.soundBuffer;
		if (soundBuffer.numberOfChannels !== this.sources.a.sample.channels) {
			throw ('number of channels does not match');
		}
		var channels = [];
		for (var i=0; i<soundBuffer.numberOfChannels; i++) {
			channels.push(soundBuffer.getChannelData(i));
		}
		var channel = soundBuffer.getChannelData(0);
		var distances = [];
		for (var i=0; i<difference+1; i++) {
			var distance = 0;
			for (var j=0; j<verifyData.length; j++) {
				distance += Math.abs(channel[j*VERIFY_DATA_INTERVAL+i]-verifyData[j]);
			}
			distances.push(distance);
		}
		distances.sort(function(a, b) {
			// reverse sort floats
			if (a < b) {
				return -1;
			}
			if (a > b) {
				return 1;
			}
			return 0;
		});
		console.log('distances:', distances);
	}

	if (difference > 1) {
		setStatus('There is a difference of ' + difference + ' samples between the tracks');
		this.spinner.setStatus('failed to load');
		var differenceTime = (difference / this.context.sampleRate*1000).toFixed(3)+'ms';
		if (!confirm('There is a difference of ' + difference + ' samples ('  + differenceTime + ') between the tracks. Are you sure you want to continue testing?')) {
			return;
		}
		this.spinner.setStatus('');
	}

	this.duration = Math.min(this.sources.a.soundBuffer.duration, this.sources.b.soundBuffer.duration);

	setStatus('ready.');
	this.ready = true;
	mediaButtonsSetDisabled(false);

	var input  = document.querySelector('#fileinput');
	var input2 = document.querySelector('#fileinput2');
	input.disabled  = false;
	input2.disabled = false;

	// load the buffer of 'A', as that is supposed to be the better one
	// Do this 'in the background' (but not really)
	setTimeout(function () {
		this.spinner.loadWaveform(this.sources.a.soundBuffer);
	}.bind(this), 0);

	this.startRound();
}

Abx.prototype.unload = function () {
	log.clear();
	this.stop();

	if (this.sources.a.url.substr(0, 5) == 'blob:') {
		URL.revokeObjectURL(this.sources.a.url);
	}
	if (this.sources.b.url.substr(0, 5) == 'blob:') {
		URL.revokeObjectURL(this.sources.b.url);
	}

	this.init();
}

Abx.prototype.loadSources = function () {
	this.loadSource(this.sources.a);
	this.loadSource(this.sources.b);
}

Abx.prototype.loadSource = function (source) {
	var request = new XMLHttpRequest();
	request.open("GET", source.url, true);
	request.responseType = "arraybuffer";
	
	// Our asynchronous callback
	request.onload = function(progress) {
		this.context.decodeAudioData(request.response, function (audioBuffer) {
			if (this.sources[source.name] !== source) {
				// new source loaded
				return;
			}
			console.log('decoded', source.fullname);
			source.soundBuffer = audioBuffer;
			this.loadedSources += 1;
			if (this.loadedSources == 2) {
				this.onLoad();
			}
		}.bind(this), function (e) {
			if (this.sources[source.name] !== source) {
				return;
			}
			console.error('failed to decode', source.fullname);
			setStatus('Failed to load audio data: '+source.fullname);
			this.spinner.setStatus('failed to load');
		}.bind(this));

		console.log('decoding', source.fullname);
	}.bind(this);
	request.send();
}


Abx.prototype.start = function () {
	if (this.playing) return;

	this.startSource(this.sources.a);
	this.startSource(this.sources.b);

	// real start time
	var startTime = this.context.currentTime + this.latency;
	var trackDuration = this.duration-this.endOffset-this.startOffset-this.pauseOffset;
	var trackOffset = this.startOffset+this.pauseOffset;

	if (trackDuration <= 0) {
		// it doesn't make sense to try to start playing
		console.warn('trackDuration < 0');
		this.stop();
		return true;
	}

	this.sources.a.sound.start(startTime, trackOffset, trackDuration);
	this.sources.b.sound.start(startTime, trackOffset, trackDuration);
	
	// how long did starting take?
	var timerDuration = (this.context.currentTime+this.latency) - startTime;
	if (timerDuration > this.latency*0.5)
		console.warn('long time to start tracks: ', timerDuration+'ms');
	if (timerDuration > this.latency*0.8)
		// this gets suspicious
		alert('Slow start. Tracks may be out of sync.');

	this.playing = true;

	// imaginary start time (the time if this would be the first resume)
	this.virtualStartTime = startTime-trackOffset;

	// update the progress bar continuously
	this.spinner.startProgress(this.getPosition(), this.duration, this.endOffset);

	// stop when this track is finished
	var timeoutID = setTimeout(function () {
		if (timeoutID != this.currentStopTimeout) return;
		this.stop();
		if (document.getElementById('repeat').checked) {
			this.setPauseOffset(0);
			this.changeSource(this.sourceName);
		}
	}.bind(this), trackDuration*1000);
	this.currentStopTimeout = timeoutID;
}

Abx.prototype.startSource = function (source) {
	source.volume = this.context.createGain();
	source.volume.gain.value = 0;

	source.sound = this.context.createBufferSource();
	source.sound.buffer = source.soundBuffer;

	// chain them together
	source.sound.connect(source.volume);
	source.volume.connect(this.context.destination);
}

Abx.prototype.changeSource = function (newSourceName, oldSource) {
	if (!document.getElementById('keep-pos-track').checked) {
		this.stop();
	}

	if (!oldSource)
		var oldSource = this.sources[this.sourceName];
	this.sourceName = newSourceName;
	var newSource = this.sources[newSourceName];

	if (this.start()) return;

	// first stop the old sound
	oldSource.volume.gain.value = 0.0;

	// now start the new sound
	newSource.volume.gain.value = 1.0;

	setStatus('playing '+newSourceName.toUpperCase());

	// remove previous selected highlight
	var previous = document.querySelector('.mediabuttons button.selected');
	if (previous)
		previous.classList.remove('selected');

	// highlight currently selected button
	document.querySelector('#button-'+newSourceName).classList.add('selected');
}

Abx.prototype.pause = function () {
	// if already paused, start playing
	if (!this.playing) {
		this.changeSource(this.sourceName);
		return;
	}

	this.currentStopTimeout = undefined;

	// stop currently playing tracks
	this.stopSource(this.sources.a);
	this.stopSource(this.sources.b);

	var pauseOffset = this.getPosition()-this.startOffset;
	this.playing = false;
	this.setPauseOffset(pauseOffset);

	setStatus('paused');

	document.querySelector('#button-'+this.sourceName).classList.remove('selected');
}

Abx.prototype.setPauseOffset = function (pauseOffset) {
	if (this.playing)
		throw 'set pauseOffset while playing';
	this.pauseOffset = pauseOffset;
	this.spinner.setProgress(this.startOffset+this.pauseOffset, this.duration);
}

// stop playing this source and free resources
Abx.prototype.stopSource = function (source) {
	// stop and remove sound
	source.sound.stop(0); // stop immediately
	source.sound.disconnect();
	source.sound = undefined;

	// remove volume node
	source.volume.disconnect();
	source.volume = undefined;
}

Abx.prototype.stop = function () {
	if (this.playing) {
		this.pause();
	}

	// start at this.startOffset
	this.setPauseOffset(0);

	setStatus('stopped');
}


Abx.prototype.nextRound = function () {
	var wasPlaying = this.playing;

	if (document.querySelectorAll('button.a').length != 2) {
		// no choice has been made.
		return;
	}
	if (!document.getElementById('keep-pos-round').checked) {
		// stop if position should be reset to start
		this.stop();
	}

	// a bit magic to determine whether this round was successful
	var result = (document.querySelectorAll('#button-x.a').length > 0) === (this.sources.a == this.sources.x);

	// lies, damned lies, and statistics
	this.guessTotal += 1;
	this.guessRight += result ? 1 : 0;
	var probability = calculateProbability(this.guessRight, this.guessTotal).toPrecision(2)+'%';
	document.querySelector('#score').innerText = this.guessRight+'/'+this.guessTotal;
	document.querySelector('#guessing-probability').innerText = probability;

	// log the result
	log.log(time()+' '+this.guessRight+'/'+this.guessTotal+' '+probability);

	// clear the current selection
	document.querySelector('#button-x').classList.remove('a');
	document.querySelector('#button-x').classList.remove('b');
	document.querySelector('#button-y').classList.remove('a');
	document.querySelector('#button-y').classList.remove('b');

	var oldSource = this.sources[this.sourceName];

	// start next round
	this.startRound();

	if (this.playing || document.getElementById('autocontinue').checked && wasPlaying) {
		// name doesn't change, but source does
		this.changeSource(this.sourceName, oldSource);
	}
}


Abx.prototype.startRound = function () {
	// this is where the magic happens
	if (Math.floor(Math.random()*2)) {
		this.sources.x = this.sources.a;
		this.sources.y = this.sources.b;
	} else {
		this.sources.x = this.sources.b;
		this.sources.y = this.sources.a;
	}
}


// get exactly how far the playing has progressed currently (whether paused or not)
Abx.prototype.getPosition = function () {
	if (this.playing) {
		return this.context.currentTime - this.virtualStartTime;
	} else {
		return this.startOffset + this.pauseOffset;
	}
}

// set the position relative to the track start.
Abx.prototype.setPosition = function (position) {
	if (position < this.startOffset || position > this.duration - this.endOffset) {
		// position out of range
		return;
	}

	if (this.playing) {
		this.stop();
		this.setPauseOffset(position-this.startOffset);
		this.changeSource(this.sourceName);
	} else {
		this.setPauseOffset(position-this.startOffset);
	}
}

Abx.prototype.setStartOffset = function () {
	this.startOffset = this.getPosition();
	// changing this.startOffset changes pauseOffset
	this.pauseOffset = 0;
}

Abx.prototype.setEndOffset = function () {
	this.endOffset = this.duration-this.getPosition();

	this.stop(); // makes more sense to stop now
}
Abx.prototype.resetStartOffset = function () {
	// to keep time at the right place
	this.pauseOffset = this.startOffset;
	this.startOffset = 0;
}
Abx.prototype.resetEndOffset = function () {
	this.endOffset = 0;
}

