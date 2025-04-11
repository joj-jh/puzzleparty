import {joinRoom} from './trystero-nostr.min.js'
// https://github.com/nomeata/sumserum/blob/master/sumserum.js
// https://github.com/cs0x7f/cstimer/blob/master/UsingAsWorkerDemo.md - broken
// https://github.com/cs0x7f/cstimer/blob/released/UsingAsWorkerDemo.md
//https://github.com/dmotz/trystero

const roomName = document.getElementById('room');
const userName = document.getElementById('username');
const connectButton = document.getElementById("connect");
const eventsList = document.getElementById('events');
const scramble = document.getElementById('scramble');
const selectedEventButton = document.getElementById('selectedEvent');
const results = document.getElementById('results');
const resultsHead = document.getElementById('resultsHead');
const resultsBody= document.getElementById('resultsBody');
const wins = document.getElementById('wins');
const single = document.getElementById('single');
const ao5 = document.getElementById('ao5');
const ao12 = document.getElementById('ao12');
const manualEntry = document.getElementById('manualEntry');
const pageContainer = document.getElementById('pageContainer');

// Edit time modal
const editModal = new bootstrap.Modal(document.getElementById('editModal'));

// Scramble preview modal
const scrambleModal = new bootstrap.Modal(document.getElementById('scrambleModal'));
const viewScrambleImage = document.getElementById('viewScrambleImage');
const viewScramble = document.getElementById('viewScramble');

//initialize the scramble provider worker
var cstimerWorker = (function() {
	var worker = new Worker('cstimer_module.js');

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
    // Add events to dropdown
    wca_events.forEach(e => {
        var li = document.createElement('li');
        li.innerHTML = e[0];
        li.setAttribute('data-value', e[1]);
        li.addEventListener('click', () => {
            if(messages.get('event') != e[1]) {
                setEvent({date: Date.now(), eventId: e[1], eventName: e[0], scrambleLength: e[2]});
            }
        });
        eventsList.appendChild(li);
    })
    selectedEventButton.setAttribute("disabled", "");

    // Add utility last() method
    if (!Array.prototype.last){
        Array.prototype.last = function(){
            return this.length > 0 ? this[this.length - 1] : null;
        };
    };

    // Get saved/url param info to try auto connect room
    userNameInput.setValue(localStorage.getItem("user_id") ?? "");
    syncUrlAndPageState();
    tryAutoConnect();
};

// Utility generator
function* takeWhile(fn, xs) {
    for (let x of xs)
        if (fn(x))
            yield x;
        else
            break;
}

function isEmptyOrSpaces(s) {
    return s === null || s.match(/^ *$/) !== null;
}

function delay(time) {  
    return new Promise(res => {
        setTimeout(res,time)
    })
}

var room;
const config = {appId: 'puzzle_party_cube_race_server_nulgaria'};
var messages = new Map();

var setEvent;
var setScramble;
var setName;
var shareMessageHistory;
var postSolve;

class Time {
    constructor(millis) {
        this.millis = millis;
    }

    static Null() {
        return new Time(null);
    }

    valueOf() {
        return this.millis;
    }

    format(nullFormat = '-') {
        if(this.millis == null){
            return nullFormat;
        }
        if(this.millis >= 3600000) {
            return '💀';
        }
        
        const centiseconds = Math.floor(this.millis/10);
        const seconds = Math.floor(centiseconds/100);
        var output = `${seconds%60}.${(centiseconds%100).toString().padStart(2,'0')}`;
        const minutes = Math.floor(seconds/60);
        if(minutes > 0) {
            output = (minutes%60).toString() + ':' + output;
        }
        
        return output;
    }
}

Time.prototype.valueOf = function() {
    return this.time ?? Number.MAX_SAFE_INTEGER;
}

class Solve {
    constructor(solverId, scrambleIndex, millis, plusTwo = false, dnf = false) {
        this.solverId = solverId; 
        this.scrambleIndex = scrambleIndex; 
        this.time = new Time((millis ?? 0) + (plusTwo ? 2000 : 0)); 
        this.plusTwo = plusTwo;
        this.dnf = dnf || millis == 0 || millis == null;
        this.date = Date.now();
    }

    format() {
        const out = this.time.format() + (this.plusTwo ? "+" : "");
        if(this.dnf) {
            return `DNF (${out})`;
        }
        else {
            return out;
        }
    }
}

var hostId; // Id of member that is room host
var isHost;
var members;

connectButton.addEventListener('click', () => {
    if(room == null) {
        setupRoom();
    }
    else {
        leaveRoom();
    }
});

class ValidatedTextbox {
    constructor(input, convertFunction, onValueChange) {
        this.convertFunction = convertFunction;
        this.input = input;
        this.onValueChange = onValueChange;
        this.value = null;

        this.input.addEventListener('input', () => {
            this.#convert();
            this.onValueChange();
        })
    }

    setValue(val) {
        if(this.input.value != val) {
            this.input.value = val;
            this.#convert();
            this.onValueChange();
        }
    }

    #convert() {
        var out = this.convertFunction(this.input.value);
        if(out == null) {
            if(!this.input.classList.contains("is-invalid")) {
                this.input.classList.add("is-invalid");
            }
        }
        else {
            this.value = out;
            this.input.classList.remove("is-invalid");
        } 
    }
}

function updateConnectButtonEnabled() {
    if(!isEmptyOrSpaces(roomName.value) && !isEmptyOrSpaces(userName.value)) {
        connectButton.removeAttribute("disabled");
    }
    else {
        connectButton.setAttribute("disabled", "");
    }
}

const userNameInput = new ValidatedTextbox(userName, s => isEmptyOrSpaces(s) ? null : s, updateConnectButtonEnabled);
const roomNameInput = new ValidatedTextbox(
    roomName, 
    s => isEmptyOrSpaces(s) ? null : s, 
    updateConnectButtonEnabled,
);

function setupRoom() {
    console.log("making room");

    const room_id = roomName.value;
    const user_id = userName.value;

    localStorage.setItem("user_id", user_id);

    // Check if hosted on github pages or just locally for tests
    if(window.location.toString().includes("github")) {
        room = joinRoom(config, room_id);
    }
    else {
        console.log(`'github' not found in url (${window.location.toString()}) - using dummy room object for testing.`);
        room = {
            selfId: "not a real id", 
            getPeers() { return new Map();} ,
            makeAction(a) { return [(x) => {}, (d,a='') => {} ]},
            onPeerJoin(_) {},
            onPeerLeave(_) {},
            leave() {}
        };
    }

    syncUrlAndPageState();
    updateMembers();

    setName = makeAction({
        room: room,
        actionName: 'name',
    })
    setName({date: Date.now(), name: user_id, id: room.selfId});

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
            updateEvent();
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
            if(isHost && allMembersReady()) {
                genScramble();
            }
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

    // Default event to 3x3
    if(members.length == 1 && isHost) {
        setEvent({date: Date.now(), eventId: wca_events[0][1], eventName: wca_events[0][0], scrambleLength: wca_events[0][2]});
    }
    
    pageContainer.setAttribute("data-connected",'');
    selectedEventButton.removeAttribute("disabled");
}

function leaveRoom() {
    room.leave();
    room = null;
    messages = new Map();
    pageContainer.removeAttribute("data-connected");
    selectedEventButton.setAttribute("disabled", "");
    roomNameInput.setValue("");
    clearUrlParams();
}

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
        if(data.date < Date.now() + 100) { // Don't accept messages from time travellers
            messages.get(actionName).push(data);
            messages.get(actionName).sort((a, b) => b.date - a.date);
            onAfterReceivedHandler(data, peerId);
        }
    });

    const customSend =  (data, peerId='') => {
        messages.get(actionName).push(data);
        messages.get(actionName).sort((a, b) => b.date - a.date);
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
        if(scram.length > 120) {
            scramble.classList.replace('fs-1', 'fs-3');
        }
        else {
            scramble.classList.replace('fs-3','fs-1');

        }
        pageContainer.setAttribute("data-has-scramble", "");
        createScrambleImage(scram, eventType).then(h => document.getElementById('drawScramble').innerHTML = h);
        renderResults();
    }
}

async function createScrambleImage(scramble, eventType) {
    var svgImage = await cstimerWorker.getImage(scramble, eventType);
    
    var template = document.createElement('template');
    template.innerHTML = svgImage;
    var svg = template.content.firstChild;
    svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    const dynamicSvg = template.innerHTML;
    template.remove();
    return dynamicSvg;
}

function genScramble() {
    const lastEvent = messages.get('event').last();
    cstimerWorker
        .getScramble(lastEvent.eventId, lastEvent.scrambleLength)
        .then(scram => {
            setScramble({date: Date.now(), scramble: scram});
        });
}

function updateEvent() {
    selectedEventButton.textContent = messages.get('event').last().eventName;
    if(eventHasChanged()) { // Just makin sure
        pageContainer.removeAttribute("data-has-scramble");
        messages.get('solve').length = 0; // Clear all solves + scrambles if event changed
        messages.get('scramble').length = 0; 
        if(isHost) {
            genScramble()
        }
    }
}

function eventHasChanged() {
    var pastEvents = messages.get('event');
    var len = pastEvents.length;
    // If the event is being set for the first time, or is different from the previous value, update stuff
    return (len == 1 || (len > 1 && pastEvents[len-1].eventId != pastEvents[len-2].eventId));
}

function allMembersReady() {
    var solvesRev = messages.get('solve').reverse();

    return members.every(m => 
        solvesRev.findIndex(s => 
            s.solverId == m && 
            s.scrambleIndex == messages.get('scramble').length-1) != -1
    );
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
//--------------------------------------------------------
// This is super inefficient, but should still work:
function renderResults() {

    function makeTh(textContent) {
        var header = document.createElement('th', {scope: "col"});
        header.textContent = textContent;
        return header;
    }

    var columnIndex = new Map();
    var solvesByMember = new Map();
    resultsHead.innerHTML = '<th scope="col">#</th>';
    members.forEach((m, i) => {
        columnIndex.set(m, i);
        solvesByMember.set(m, messages.get('scramble').map(_ => null));
        var header = document.createElement('th', {scope: "col"});
        resultsHead.appendChild(
            makeTh(
                messages.get('name').reverse().find(n => n.id == m).name
            )
        );
    });

    resultsHead.appendChild(document.createElement('th', {scope: "col"}));

    resultsBody.innerHTML = "";
    var rowCount = 0;
    messages.get('scramble').forEach((scramble, index) => {
        var row = document.createElement('tr');
        var rowNumber = document.createElement('th');
        rowNumber.textContent = index+1;
        row.appendChild(rowNumber);
        members.forEach(() => {
            row.appendChild(document.createElement('td'));
        });
        row.appendChild(document.createElement('td'));
        resultsBody.prepend(row);
        rowCount++;
    });

    messages.get('solve').forEach((solve) => {
        if(columnIndex.has(solve.solverId)){
            var tableEntry = resultsBody.children[rowCount - 1 - solve.scrambleIndex].children[columnIndex.get(solve.solverId)+1];
            solvesByMember.get(solve.solverId)[solve.scrambleIndex] = solve;
            tableEntry.textContent = solve.format();
            tableEntry.setAttribute('data-plustwo', solve.plusTwo.toString());
            tableEntry.setAttribute('data-dnf', solve.dnf.toString());
            tableEntry.setAttribute('data-solve-index', solve.scrambleIndex);
        }
    });

    single.innerHTML = '<th scope="col">single</th>';
    ao5.innerHTML = '<th scope="col">ao5</th>';
    ao12.innerHTML = '<th scope="col">ao12</th>';
    members.forEach(m =>  {
        const s = solvesByMember.get(m);
        
        single.appendChild( 
            makeTh(
                s.filter(solve => solve!= null && !(solve.dnf))
                .concat(Time.Null())
                .reduce((min, cur) => cur < min ? cur : min)
                .format()
            )
        );

        var ao5s = getTruncatedMeans(s, 5);
        ao5.appendChild(
            makeTh(`${ao5s.last.format('DNF')} | ${ao5s.best.format('DNF')}`)
        );

        var ao12s = getTruncatedMeans(s, 12);
        ao12.appendChild(
            makeTh(`${ao12s.last.format('DNF')} | ${ao12s.best.format('DNF')}`)
        );
    });
    single.appendChild(document.createElement('th'));
    ao5.appendChild(document.createElement('th'));
    ao12.appendChild(document.createElement('th'));
}

// This is the bad O(n^2) way and it makes my teeth hurt
function getTruncatedMeans(solves, meanSize) {
    var means = {best: Time.Null(), last: Time.Null()};

    for(var i = 0; i < solves.length-meanSize; i++) {
        var dnfs = 0;
        var sum = 0;
        var min = Number.MAX_SAFE_INTEGER;
        var max = 0;
        for(var j = i; j < i+meanSize; j++) {
            sum += solves[j].time.millis;
            dnfs += solves[j].dnf ? 1:0;
            min = solves[j].time.millis < min ? solves[j].time.millis : min;
            max = solves[j].time.millis > max ? solves[j].time.millis : max;
        }

        if(dnfs > 1) {
            means.last = Time.Null();
        }
        else {
            means.last = new Time((sum - min - max)/(meanSize-2));
        }

        if(means.last < means.best || means.best.millis == null) {
            means.best = means.last;
        }
    }
    return means;
}

// URL parameters and initialisation
//--------------------------------------------------------

function clearUrlParams() {
    var params = new URLSearchParams(window.location.search);
    params.delete('room');
    window.history.replaceState({}, "", `?${params.toString()}`)
    //window.location.search = params.toString();
}

function syncUrlAndPageState() {
    var params = new URLSearchParams(window.location.search);
    var roomNameParam = params.get('room');

    if(roomNameParam != roomName.value && !isEmptyOrSpaces(roomName.value) && roomNameParam == null) { // If text box has value and url null, set url
        params.set('room', roomName.value.toString());
        window.history.replaceState({}, "", `?${params.toString()}`)
        ///window.location.search = params.toString();
    }
    else { // Treat url as source of truth
        roomNameInput.setValue(roomNameParam ?? "");
    }
}

function tryAutoConnect() {
    if(room == null && !isEmptyOrSpaces(roomName.value) && !isEmptyOrSpaces(userName.value)) {
        setupRoom();
    }
}

// Time input component - spacebar, touch and manual entry:
//--------------------------------------------------------

const teState = {
    Initialised: 'initialised',
    Inspecting: 'inspecting',
    HandsDown: 'handsDown',
    ReadyToStart: 'readyToStart',
    Timing: 'timing',
    AwaitingEntry: 'awaitingEntry',
}
class TimeEntry {
    constructor(container, onSubmit) {
        // Component configuration
        this.inspectionEnabled = true;
        this.manualEntry = false;

        // Component state
        this.state = teState.Initialised;
        this.lastHandsDown = null;
        this.inspectionInterval = null;
        this.inspectionSeconds = null;
        this.startTimer = null;
        this.stopTimer = null;

        // Rendering stuff
        this.container = document.getElementById('timeEntryTemplate').content.cloneNode(true).firstElementChild;
        this.nodeInspectionOverlay = this.container.querySelector('.inspectionOverlay');
        this.nodeTimerEntry = this.container.querySelector('.timerEntry')
        this.nodePlusTwoCheck = this.container.querySelector('.plusTwoCheck');
        this.nodeDnfCheck = this.container.querySelector('.dnfCheck');
        this.nodeSubmitButton = this.container.querySelector('.btn');

        this.nodeManualEntry = new ValidatedTextbox(
            this.container.querySelector('.manualEntry'),
            t => {
                var content = "000000" + this.nodeManualEntry.input.value.replace(/[\s]/g, "");
                if(isNaN(content)) {
                    return null;
                }
                else {
                    var ms = parseInt(content.substring(content.length-2)) * 10;
                    ms += parseInt(content.substring(content.length-4,content.length-2))*1000;
                    ms += parseInt(content.substring(0,content.length-4))*60000;
                    return ms;
                }
            },
            () => {
                this.startTimer = 0;
                this.stopTimer = this.nodeManualEntry.value;
                this.#setState(teState.AwaitingEntry);
            }
        );

        this.nodeManualEntry.input.addEventListener('keydown', (event) => {
            if(event.key == "Enter") {
                this.#submit();
            }
            else if(!"123456890".includes(event.key) && ["Escape", "ArrowLeft", "ArrowRight", "Backspace", "Clear", "Delete"].indexOf(event.key) == -1) {
                event.preventDefault();
            }
        });

        container.appendChild(this.container);

        // Handlers 
        this.onSubmit = onSubmit

        this.nodeSubmitButton.addEventListener('click', () => {
            this.#submit();
        })

        // Render attributes
        this.#setState(teState.Initialised);
        this.setManualEntry(this.manualEntry);
        this.enableInspection(this.inspectionEnabled);
    }

    initTime(solve) {
        this.setManualEntry(true);
        this.enableInspection(false);
        this.nodeManualEntry.setValue(solve.time.format().replace(/\D/g, ""));
    }

    enableInspection(enabled) {
        if([teState.Initialised, teState.AwaitingEntry].indexOf(this.state) != -1) {
            this.inspectionEnabled = enabled;
            this.container.setAttribute('data-inspection-enabled', enabled.toString());
        }
        return this.inspectionEnabled;
    }

    setManualEntry(manual) {
        if(this.state == teState.Initialised) { // allow only when there's no data
            this.manualEntry = manual;
            this.container.setAttribute('data-manual-entry', manual.toString())
        }
        else if(this.state == teState.AwaitingEntry) {
            const tmpTimeString = new Time(this.stopTimer - this.startTimer).format();
            this.nodeManualEntry.setValue(tmpTimeString.replace(/\D/g, ""));
            this.nodeTimerEntry.stringValue = tmpTimeString;
            this.manualEntry = manual;
            this.container.setAttribute('data-manual-entry', manual.toString())
        }
        return this.manualEntry;
    }

    async pressTimer() {
        if(this.state == teState.Timing) {
            this.#stopTimer();
            this.#setState(teState.AwaitingEntry);
        }
        else if(this.state == teState.Initialised) {
            if(this.inspectionEnabled) {
                this.#inspect();
                this.#setState(teState.Inspecting);
            }
            else if(!this.manualEntry) {
                this.#setState(teState.HandsDown);
                await this.#startHalfSecondDelay();
            }
        }
        else if(this.state == teState.Inspecting && !this.manualEntry) {
            this.#setState(teState.HandsDown);
            await this.#startHalfSecondDelay();
        }
    }

    releaseTimer() {
        if(this.state == teState.HandsDown) {
            if(this.inspectionEnabled) {
                this.#setState(teState.Inspecting);
            }
            else {
                this.#setState(teState.Initialised);
            }
        }
        else if(this.state == teState.ReadyToStart) {
            this.#stopInspection();
            this.startTimer = Date.now();
            this.#setState(teState.Timing);
        }
    }

    tryCancelInspection() {
        if(this.state == teState.Inspecting) {
            this.#setState(teState.Initialised);
            this.#stopInspection();
        }
    }

    async #startHalfSecondDelay() {
        this.lastHandsDown = Date.now();
        const localLastHandsDown = this.lastHandsDown;
        await delay(500);
        if(this.lastHandsDown == localLastHandsDown && this.state == teState.HandsDown) {
            this.#setState(teState.ReadyToStart);
        }
    }

    #submit() {
        if(this.state == teState.AwaitingEntry) {
            this.onSubmit(this.stopTimer - this.startTimer, this.nodePlusTwoCheck.checked, this.nodeDnfCheck.checked);
            this.nodeManualEntry.setValue("");
            this.nodeTimerEntry.textContent = "";
            this.nodeDnfCheck.checked = false;
            this.nodePlusTwoCheck.checked = false;
            this.#setState(teState.Initialised);
            this.nodeSubmitButton.blur();
            this.container.focus(); // pull focus away from button to avoid auto-submission
        }
    }

    #inspect() {
        if(this.inspectionInterval != null) {
            clearInterval(this.inspectionInterval);
        }

        this.inspectionSeconds = 0;
        this.nodeInspectionOverlay.setAttribute('data-seconds', this.inspectionSeconds);
        this.inspectionInterval = setInterval(() => {
            if(this.inspectionSeconds >= 17) {
                this.#stopInspection();
            } else {
                this.inspectionSeconds++;
                this.nodeInspectionOverlay.setAttribute('data-seconds', this.inspectionSeconds);
            }
        }, 1000);
    }

    #stopInspection() {
        clearInterval(this.inspectionInterval);
        this.inspectionInterval = null;
    }

    #stopTimer() {
        this.stopTimer = Date.now();
        this.nodeTimerEntry.textContent = new Time(this.stopTimer - this.startTimer).format();
        if(this.inspectionSeconds >= 17) {
            this.nodeDnfCheck.checked = true;
        }   
        else if(this.inspectionSeconds >= 15) {
            this.nodePlusTwoCheck.checked = true;
        }

        this.nodeSubmitButton.removeAttribute('disabled', '');
        this.nodeDnfCheck.removeAttribute('disabled', '');
        this.nodePlusTwoCheck.removeAttribute('disabled', '');
        this.nodeSubmitButton.focus();
    }

    #setState(newState) {
        this.state = newState;  
        this.container.setAttribute('data-state', this.state);
    }
}

const mainTimeInput = new TimeEntry(
    document.getElementById('mainTimerContainer'),
    (ms, p2, dnf) => {
        postSolve(
            new Solve(
                room.selfId, 
                messages.get('scramble').length-1, 
                ms, 
                p2, 
                dnf
            )
        );
    }
);

mainTimeInput.setManualEntry(manualEntry.checked);
mainTimeInput.enableInspection(inspection.checked);
inspection.addEventListener('change', () => { 
    const resultingValue = mainTimeInput.enableInspection(inspection.checked); 
    inspection.checked = resultingValue;
    inspection.blur();
});

manualEntry.addEventListener('change', () => {
    const resultingValue = mainTimeInput.setManualEntry(manualEntry.checked);
    manualEntry.checked = resultingValue;
    manualEntry.blur();
});

document.body.addEventListener('keydown', (event) => {
    if(event.key == " ") {
        mainTimeInput.pressTimer();
    }
    else {
        mainTimeInput.tryCancelInspection();
    }
});

document.body.addEventListener('keyup', (event) => {
    if(event.key == " ") {
        mainTimeInput.releaseTimer();
    }
    else {
        mainTimeInput.tryCancelInspection();
    }
});

// Solve selection and editing:
//--------------------------------------------------------

// setupTimeInput(editTime, ms => {
//     postSolve(
//         new Solve(
//             room.selfId, 
//             selectedSolveIndex, 
//             ms, 
//             editPlusTwo.checked, 
//             editDnf.checked
//         )
//     );
//     editModal.hide();
// });

const editTimeInput = new TimeEntry(
    document.querySelector('#editModal .modal-body'),
    (ms, p2, dnf) => {
        postSolve(
            new Solve(
                room.selfId, 
                selectedSolveIndex, 
                ms, 
                p2, 
                dnf
            )
        );
        editModal.hide();
    }
)

var selectedSolveIndex = null;
resultsBody.addEventListener('click', event => {
    // Handle clicking and showing editor modal
    var cell = event.target.closest('td');
    if(cell) {
        selectedSolveIndex = parseInt(cell.getAttribute('data-solve-index'));
        if(selectedSolveIndex != null) {
            const solve = messages.get('solve')[selectedSolveIndex];
            editTimeInput.initTime(solve);
            editModal.show();
        }
    }

    // Handle clicking and showing scramble modal
    cell = event.target.closest('th');
    if(cell) {
        var scrambleIndex = parseInt(cell.textContent);
        if(scrambleIndex != null) {
            scrambleIndex -= 1; // Convert for use with 0-indexed arrays
            const scram = messages.get('scramble')[scrambleIndex];
            const eventType = messages.get('event').last().eventId;
            if(scram && eventType) {
                viewScramble.textContent = scram.scramble;
                createScrambleImage(scram.scramble, eventType)
                    .then(h => {
                        viewScrambleImage.innerHTML = h;
                        scrambleModal.show();
                    });
            }
        }
    }
});