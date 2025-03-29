import {joinRoom} from './trystero-torrent.js'
// https://github.com/nomeata/sumserum/blob/master/sumserum.js
// https://github.com/cs0x7f/cstimer/blob/master/UsingAsWorkerDemo.md - broken
// https://github.com/cs0x7f/cstimer/blob/released/UsingAsWorkerDemo.md
//https://github.com/dmotz/trystero

const connectButton = document.getElementById("connect");
const eventsList = document.getElementById('events');
const scramble = document.getElementById('scramble');
const selectedEventButton = document.getElementById('selectedEvent');
const resultsHead = document.getElementById('resultsHead');
const resultsBody= document.getElementById('resultsBody');
const plusTwo = document.getElementById('plusTwo');
const dnf = document.getElementById('dnf');
const time = document.getElementById('time');
                    
//initialize the scramble provider worker
var cstimerWorker = (function() {
	var worker = new Worker('node_modules/cstimer_module/cstimer_module.js');

	var callbacks = {};
	var msgid = 0;

	worker.onmessage = function(e) {
		var data = e.data; //data: [msgid, type, ret]
		var callback = callbacks[data[0]];
		delete callbacks[data[0]];
		callback && callback(data[2]);
	}

	function callWorkerAsync(type, details) {
		return new Promise(function(type, details, resolve) {
			++msgid;
			callbacks[msgid] = resolve;
			worker.postMessage([msgid, type, details]);
		}.bind(null, type, details));
	}

	return {
		getScrambleTypes: function() {
			return callWorkerAsync('scrtype');
		},
		getScramble: function() {
			return callWorkerAsync('scramble', Array.prototype.slice.apply(arguments));
		},
		setSeed: function(seed) {
			return callWorkerAsync('seed', [seed]);
		},
		setGlobal: function(key, value) {
			return callWorkerAsync('set', [key, value]);
		},
		getImage: function(scramble, type) {
			return callWorkerAsync('image', [scramble, type]);
		}
	}
})();

var wca_events = [
	["3x3x3", "333", 0],
	["2x2x2", "222so", 0],
	["4x4x4", "444wca", 0],
	["5x5x5", "555wca", 60],
	["6x6x6", "666wca", 80],
	["7x7x7", "777wca", 100],
	["3x3 bld", "333ni", 0],
	["3x3 fm", "333fm", 0],
	["3x3 oh", "333", 0],
	["clock", "clkwca", 0],
	["megaminx", "mgmp", 70],
	["pyraminx", "pyrso", 10],
	["skewb", "skbso", 0],
	["sq1", "sqrs", 0],
	["4x4 bld", "444bld", 40],
	["5x5 bld", "555bld", 60],
	["3x3 mbld", "r3ni", 5]
];

window.onload = function() {
    wca_events.forEach(e => {
        var li = document.createElement('li');
        li.innerHTML = e[0];
        li.setAttribute('data-value', e[1]);
        li.addEventListener('click', () => {
            if(messages.get('event') != e[1]) {
                setEvent({date: Date.UTC(), eventId: e[1], eventName: e[0]});
            }
        });
        eventsList.appendChild(li);
    })

    if (!Array.prototype.last){
        Array.prototype.last = function(){
            return this.length > 0 ? this[this.length - 1] : null;
        };
    };
};

var room;
const config = {appId: 'puzzle_party_cube_race_server_nulgaria'};
var messages = new Map();

var setEvent;
var setScramble;
var setName;
var shareMessageHistory;
var postSolve;

class Solve {
    constructor(solverId, scrambleIndex, millis, plusTwo = false, dnf = false) {
        this.solverId = solverId; 
        this.scrambleIndex = scrambleIndex; 
        this.millis = millis; 
        this.plusTwo = plusTwo;
        this.dnf = dnf;
    }

    format() {
        if(millis >= 3600000) {
            return '💀';
        }
        const centiseconds = Math.floor(millis/10);
        const seconds = Math.floor(centiseconds/100);
        var output = `${seconds%60}.${centiseconds%100}`;
        const minutes = Math.floor(seconds/60);
        if(minutes > 0) {
            output = (minutes%60).toString() + ':' + output;
        }
        
        return output;
    }
}

var hostId; // Id of member that is room host
var isHost;
var members;

connectButton.addEventListener('click', () => {
    console.log("making room");
    const room_id = document.getElementById('room').value;
    const user_id = document.getElementById('username').value ?? 'anonymous';

    room = joinRoom(config, room_id);
    updateMembers();

    setName = makeAction({
        room: room,
        actionName: 'name',
    })
    setName({date: Date.UTC(), name: user_id, id: room.selfId});

    setScramble = makeAction({
        room: room, 
        actionName: 'scramble', 
        onAfterReceivedHandler: (data, peerId) => {
            updateScramble();
        },
        onAfterSendHandler: (data, peerId) => {
            updateScramble();
        }
    });

    setEvent = makeAction({
        room: room, 
        actionName: 'event', 
        onAfterReceivedHandler: (data, peerId) => {
            updateEvent();
        },
        onAfterSendHandler: (data, peerId) => {
            console.log("setting event")
            updateEvent();

            // If this user has just changed the event, then they are responsible for genning the scramble:
            if(eventChanged()) { // Setting the same event shouldn't gen a new scramble
                genScramble();
            }
        }
    });

    postSolve = makeAction({
        room: room,
        actionName: 'solve',
        onAfterReceivedHandler: (data, peerId) => {
            renderResults();
        },
        onAfterSendHandler: (data, peerId) => {
            renderResults();
        }
    });

    shareMessageHistory = makeAction({
        room: room, 
        actionName: 'history',
        onAfterReceivedHandler: (data, peerId) => {
            messages = data;
        }
    });

    room.onPeerJoin(peerId => { 
        updateMembers();
        if(isHost) {
            shareMessageHistory(messages, peerId);
        }
    });
    
    room.onPeerLeave(peerId => { 
        updateMembers();
    });
});

time.addEventListener('keyup', ({key}) => {
    if(key == "Enter") {
        try {
            const content = "000000" + time.textContent;
            var ms = parseInt(content.substring(-2)) * 10;
            ms += parseInt(content.substring(-4,-2))*1000;
            ms += parseInt(content.substring(0, -4))*60000;
            postSolve(
                new Solve(
                    room.selfId, 
                    messages.get('scramble').length-1, 
                    ms, 
                    plusTwo.checked, 
                    dnf.checked
                )
            );
        }
        catch {

        }
    }
});

// wraps room makeAction method - adds messages to history lists
// history lists allow for easily onboarding new peers as they join
function makeAction({
    room: room, 
    actionName: actionName, 
    onAfterSendHandler: onAfterSendHandler = (data, peerId) => {}, 
    onAfterReceivedHandler: onAfterReceivedHandler = (data, peerId) => {} }
) {
    messages.set(actionName, []);
    
    const [send, onGet] = room.makeAction(actionName);
    onGet((data, peerId) => {
        if(data.date < Date.UTC() + 100) { // Don't accept messages from time travellers ()
            messages.get(actionName).push(data).sort((a, b) => a.date - b.date)
            onAfterReceivedHandler(data, peerId);
        }
    });

    const customSend =  (data, peerId='') => {
        messages.get(actionName).push(data);
        if(peerId == '') {
            send(data);
        }
        else { 
            send(data,peerId); 
        }
        onAfterSendHandler(data, peerId)
    };
    return customSend;
}

function updateScramble() {
    const scram = messages.get('scramble').last()?.scramble;
    const eventType = messages.get('event').last()?.eventId;
    if(scram != null && eventType != null) {
        scramble.textContent = scram;
        cstimerWorker
            .getImage(scram, eventType)
            .then(svgImage => {
                var template = document.createElement('template');
                template.innerHTML = svgImage;
                var svg = template.content.firstChild;
                svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                document.getElementById('drawScramble').innerHTML = template.innerHTML;
            });
        renderResults();
    }
}

function genScramble() {
    cstimerWorker
        .getScramble(messages.get('event').last().eventId)
        .then(scram => {
            setScramble({date: Date.UTC(), scramble: scram});
        });
}

function updateEvent() {
    selectedEventButton.textContent = messages.get('event').last().eventName;
    if(eventChanged()) { // Just makin sure
        messages.get('solve').length = 0; // Clear all solves + scrambles if event changed
        messages.get('scramble').length = 0; 
    }
}

function eventChanged() {
    var pastEvents = messages.get('event');
    var len = pastEvents.length;
    // If the event is being set for the first time, or is different from the previous value, update stuff
    return (len == 1 || (len == 2 && pastEvents[len-1].eventId != pastEvents[len-2].eventId));
}

function updateMembers() {
    members = Array.from(room
    .getPeers())
    .concat(room.selfId);

    members.sort();

    hostId = members.reduce((min, peerId) => peerId < min ? peerId : min);
    isHost = room.selfId == hostId;
}

// Rendering stuff:
// This is super inefficient, but should still work:
function renderResults() {
    var columnIndex = new Map();

    resultsHead.innerHTML = '<th scope="col">#</th>';
    members.forEach((m, i) => {
        columnIndex.set(m, i);
        var header = document.createElement('th', {scope: "col"});
        header.textContent = messages.get('name').reverse().find(n => n.id == m).name;
        resultsHead.appendChild(header);
    });

    resultsBody.innerHTML = "";
    messages.get('scramble').forEach((scramble, index) => {
        var row = document.createElement('tr');
        var rowNumber = document.createElement('th');
        rowNumber.textContent = index+1;
        row.appendChild(rowNumber);
        members.forEach(() => {
            row.appendChild(document.createElement('td'));
        });
        resultsBody.appendChild(row);
    });

    messages.get('solve').forEach(solve => {
        if(columnIndex.has(solve.solverId)){
            var tableEntry = resultsBody.children[solve.scrambleIndex].children[columnIndex.get(solve.solverId)];
            tableEntry.textContent = solve.format();
            tableEntry.setAttribute('data-plustwo', solve.plusTwo.toString());
            tableEntry.setAttribute('data-dnf', solve.dnf.toString());
        }
    });
}
