'use strict';

function Log () {
}

Log.prototype.log = function (line) {
	var logfield = document.getElementById('log');
	console.log('LOG: '+line);

	logfield.value += line+"\n";

	// let the logfield expand if needed
	if (logfield.scrollHeight > logfield.clientHeight)
		logfield.style.height = logfield.scrollHeight+'px';
}

Log.prototype.clear = function () {
	document.getElementById('log').value = '';
}

