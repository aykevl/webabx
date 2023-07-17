'use strict';
/* Implement an audio waveform, mainly */

function ProgressSpinner (id, element) {
	this.id = id;
	this.element = element;
	this.canvas = this.element.querySelector('.waveform');

	// add event listener
	// Won't be added multiple times when this function is called more than once.
	this.element.addEventListener('mousedown', this.onProgressClick.bind(this), false);
	this.element.addEventListener('mousemove', this.onProgressClick.bind(this), false);

	// update size, otherwise drawing may be distorted
	this.canvas.width  = this.canvas.clientWidth;
	this.canvas.height = this.canvas.clientHeight;
}

/* events for waveform */
ProgressSpinner.mouseDown = 0;

document.addEventListener('mousedown', function (e) {
	if (e.button != 0) return; // only register left clicks
	ProgressSpinner.mouseDown = 1;
}, false);

document.addEventListener('mouseup', function (e) {
	ProgressSpinner.mouseDown = 0;
}, false);

ProgressSpinner.prototype.onProgressClick = function (e) {
	if (e.button != 0) return;
	// e.detail is the amout of clicks. When positive, the mouse is at least down...
	if (!ProgressSpinner.mouseDown && e.detail == 0) return;
	e.preventDefault();

	// calculate current position
	var x = e.pageX - this.element.offsetLeft;
	var width = this.element.clientWidth;
	var position = x/width;

	this.onclick(position);
}




// draw the waveform on the wave canvas
ProgressSpinner.prototype.loadWaveform = function (buffer, start, stop) {
	// see here for details:
	// https://github.com/katspaugh/wavesurfer.js
	// That one only calculates maximum peaks (resulting in not very useful
	// waveforms for complex music) and only calculates one channel.
	// Comparing the waveforms, I think such an average absolute peak height
	// is the one Mixxx uses.

	if (start === undefined)
		start = 0;
	if (stop  === undefined)
		stop = buffer.getChannelData(0).length;
	if (start >= stop) return;

	var width  = this.canvas.width;
	var height = this.canvas.height;
	var middle = height/2;

	var ctx = this.canvas.getContext('2d');

	// draw a line in the middle, as base for the waveform
	if (start == 0) {
		this.setStatus(); // clear status message

		this.drawStartTime = Date.now()/1000;

		ctx.beginPath();
		ctx.strokeStyle = '#c00';
		ctx.moveTo(0, middle+0.5);
		ctx.lineTo(width, middle+0.5);
		ctx.closePath();
		ctx.stroke();
	}

	var length = buffer.getChannelData(0).length;

	var istart = Math.round(start/length*width);
	// the round() is dangerous in this case, but it seems to be needed because
	// of rounding errors...
	// Well, the worst thing that can happen is that some lines are skipped
	// (which is easily recognised)
	var istop  = Math.floor(stop/length*width);
	for (var i=istart; i<istop; i++) {
		// calculate peak height of this sample
		var avgpeak = 0;
		var sampleStart  = Math.floor(i*length/width);
		var sampleStop   = Math.floor((i+1)*length/width);
		var sampleLength = sampleStop - sampleStart;
		// how much are skipped + 1
		// This increases draw time a lot, with hardly visible difference.
		var jumpsize = Math.floor(Math.max(sampleLength/5000, 1));
		for (var channel=0; channel<buffer.numberOfChannels; channel++) {
			var sample = buffer.getChannelData(channel).subarray(sampleStart, sampleStart+sampleLength);
			for (var iSample=0; iSample<sample.length; iSample+=jumpsize) {
				avgpeak += Math.abs(sample[iSample])*jumpsize;
			}
		}
		avgpeak /= sample.length*buffer.numberOfChannels;

		ctx.beginPath();
		ctx.strokeStyle = '#600';

		// draw the average peak height.
		// avpeak is 0 .. ~0.5
		ctx.moveTo(i+0.5, middle+0.5 - avgpeak*2*middle);
		ctx.lineTo(i+0.5, middle+0.5 + avgpeak*2*middle);

		ctx.stroke();
		ctx.closePath();


		if (sampleStop % (5*44100) < sampleLength) { // most often, ~5 seconds (with 44.1khz)
			setTimeout(function () {
				this.loadWaveform(buffer, sampleStop, stop);
			}.bind(this), 0);
			break;
		}
	}

	if (i == istop) {
		// drawing has finished
		console.log(this.id, 'draw time', (Date.now()/1000-this.drawStartTime).toPrecision(3)+'s');
	}
}

ProgressSpinner.drawWaveFragment = function (ctx, istart, istop) {
}

ProgressSpinner.prototype.setStatus = function (s) {
	if (!s) var s = '';
	this.element.querySelector('.progresstext').textContent = s;
	// clear canvas
	this.canvas.height = this.canvas.height;
}


ProgressSpinner.prototype.startProgress = function (pos, duration, endOffset) {
	var progressfill = this.element.querySelector('.progressfill');
	this.setProgress(pos, duration);
	var progressRest = duration-pos-endOffset;
	// using transitions to show progress. Nifty, eh?
	progressfill.style.transition       = 'width linear '+progressRest+'s';
	progressfill.style.width = (duration-endOffset)/duration*100+'%';
}

// set progress to current position and prepare spinner
ProgressSpinner.prototype.setProgress = function (pos, duration) {
	var progressfill = this.element.querySelector('.progressfill');
	var progressmax  = this.element.clientWidth;
	var progressPos = pos/duration*progressmax;

	progressfill.style.transition = '';
	progressfill.style.width = progressPos+'px';
}

