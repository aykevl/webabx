'use strict';

function getMediaButtons () {
	return document.querySelectorAll('.mediabuttons button');
}

function mediaButtonsSetDisabled (disabled) {
	var buttons = getMediaButtons();
	for (var i = 0; i<buttons.length; i++) {
		buttons[i].disabled = disabled;
	}
}

function setGuess (x, y) {
	document.querySelector('#button-x').classList.remove(y);
	document.querySelector('#button-x').classList.add(x);
	document.querySelector('#button-y').classList.remove(x);
	document.querySelector('#button-y').classList.add(y);
}

document.addEventListener('keypress', function (e) {
	// see http://unixpapa.com/js/key.html
	if (!abx.ready) return;
	var c = String.fromCharCode(e.which);
	if ('abxy'.indexOf(c) >= 0) { // one of these chars
		abx.changeSource(c);
	} else if ('AB'.indexOf(c) >= 0 && 'xy'.indexOf(abx.sourceName) >= 0) {
		if ((abx.sourceName == 'x') === (c == 'A')) {
			// straight
			setGuess('a', 'b');
		} else {
			// crossed
			setGuess('b', 'a');
		}
	} else if (c == ' ') {
		abx.pause();
	} else if (c == 's') {
		abx.setStartOffset();
	} else if (c == 'e') {
		abx.setEndOffset();
	} else if (c == 'S') {
		abx.resetStartOffset();
	} else if (c == 'E') {
		abx.resetEndOffset();
	// apparently, it's not possible to do this from a keypress event,
	// at least not in Chrome
	} else if (c == 'o') {
		document.getElementById('fileinput').focus();
		document.getElementById('fileinput').click();
	} else {
		return;
	}

	e.preventDefault();
});

document.addEventListener('keydown', function (e) {
	if (!abx.ready) return;

	if (e.which == 27) {
		abx.stop();

	} else if (e.which == 13) {
		abx.nextRound();

	} else {
		return;
	}

	e.preventDefault();
});




function setStatus (s) {
	document.getElementById('status').textContent = s;
}



/* utilities */


// calculate type I error.
// Based on http://kde-apps.org/content/show.php?content=21358
function calculateProbability(right, total) {
	// divide by zero and such
	if (total <= 0) {
		return undefined;
	}

	function fac (n) {
		var x = 1;
		for (var i=1; i<=n; i++) {
			x = x*i;
		}
		return x;
	}

	var chance = 0;
	for (var i=right; i<total+1; i++) {
		chance += fac(total)/(fac(i)*fac(total-i))*Math.pow(0.5, i)*Math.pow(0.5, total-i);
	}

	return Math.round(chance*10000)/100;
}

/* Convert a number to a string of two (or more, if needed) digits.
 * Useful for dates and times */
function twodec (num) {
	var s = String(num);
	if (s.length == 1)
		s = '0'+s;
	return s;
}

// align the string to the right
function ralign(s, length) {
	while (s.length < length) {
		s = ' '+s;
	}
	return s;
}

// timestamp geneator
function time (date) {
	var t = new Date();
	var s = '';
	if (date)
		s += t.getFullYear() + '-' + twodec(t.getMonth()+1) + '-' + twodec(t.getDate()) + ' ';
	s += twodec(t.getHours()) + ':' + twodec(t.getMinutes()) + ':' + twodec(t.getSeconds());
	return s;
}

/* Human-readable file size */
function filesize(size) {
	var K = 1024;
	var M = 1024*K;
	var G = 1024*M;
	if (size > G/10)
		return (size/G).toPrecision(2)+'GB';
	if (size > M/10)
		return (size/M).toPrecision(2)+'MB';
	if (size > K/10)
		return (size/K).toPrecision(2)+'KB';
	return size+'B';
}

// calculate which bitrate the file likely is
// Not as good as really inspecting it, but should do a fairly good job
function bitrate(stream) {
	if (stream.bitrate) {
		return stream.bitrate;
	}
	if (!stream.filesize)
		return '?kbps';
	return '~' + (stream.filesize*8/stream.soundBuffer.duration/1024).toFixed(0) + 'kbps';
}

function readFloat32Array(s) {
	var b = atob(s);
	if (b.length % 4 !== 0) {
		throw 'binary string is not dividable by 4';
	}
	var a = new Float32Array(b.length/4);
	var dv = new DataView(a.buffer);
	for (var i=0; i<b.length; i++) {
		var c = b.charCodeAt(i);
		if (c > 255) {
			throw 'RangeError: character out of byte range';
		}
		dv.setUint8(i, c);
	}
	return a;
}
