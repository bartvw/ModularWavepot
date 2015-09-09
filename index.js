/**
 * @name ModularWavepot
 */
function noteToFreq(note) {
  var freqs = {
    'a': 440.00,
    'a#': 466.16,
    'b': 493.88,
    'c': 523.25,
    'c#': 554.37,
    'd': 587.33,
    'd#': 622.25,
    'e': 659.25,
    'f': 698.46,
    'f#': 739.99,
    'g': 783.99,
    'g#': 830.61
  };
  
  var octave = note.substr(-1, 1);
  var pitch = note.substr(0, note.length-1);
  var factor = Math.pow(2, octave - 4);
  
  return factor * freqs[pitch];
}

/**
 * Monosynth
 */
function MonoSynth(waveFunction, ampEnvelopeGenerator) {
  this.waveFunction = waveFunction;
  this.ampEnvelopeGenerator = ampEnvelopeGenerator;
  this.pitchEnvelopeGenerator = new AttackDecayEnvelope(0, 0.02);
  this.pitchEnvelopeAmplitude = 0.2;
  
  this.note = null;
  this.attackOffset = 0;
  this.releaseOffset = 0;
  this.noteStart = 0;
}

MonoSynth.prototype.dsp = function(t) {
  if (!this.note) {
    return 0;
  }
  
  var level = this.ampEnvelopeGenerator.getValue(t);
  
  var frequency = noteToFreq(this.note);
  if (this.pitchEnvelopeGenerator) {
    frequency = frequency + frequency * this.pitchEnvelopeGenerator.getValue(t) * this.pitchEnvelopeAmplitude;
  }
  
  return level * this.waveFunction(t - this.noteStart, frequency);
};

MonoSynth.prototype.setPitchEnvelope = function(pitchEnvelopeGenerator, amplitude) {
  this.pitchEnvelopeGenerator = pitchEnvelopeGenerator;
  this.pitchEnvelopeAmplitude = amplitude;
};

MonoSynth.prototype.noteOn = function(t, note) {
  this.noteStart = t;
  this.ampEnvelopeGenerator.triggerAttack(t);
  this.pitchEnvelopeGenerator.triggerAttack(t);
  this.note = note;
};


/**
 * PolySynth (multiplexed monosynths)
 */
function PolySynth(monosynthFunction, polyfony) {
  this.synths = [];
  this.currentSynth = 0;
  this.mixer = new Mixer(1);
  this.polyfony = polyfony;
  for (var i = 0; i < polyfony; i++) {
    var synth = monosynthFunction();
    this.synths.push(synth);
    this.mixer.addChannel(synth, 0.7);
  }
}

PolySynth.prototype.noteOn = function(t, note) {
  this.synths[this.currentSynth].noteOn(t, note);
  this.currentSynth++;
  this.currentSynth %= this.polyfony;
}

PolySynth.prototype.dsp = function(t) {
  return this.mixer.dsp(t);
}


/**
 * AD Envelope Generator
 */
function AttackDecayEnvelope(attackTime, decayTime) {
  this.attackTime = attackTime;
  this.decayTime = decayTime;
  this.start = 0;
  this.triggered = false;
}

AttackDecayEnvelope.prototype.triggerAttack = function(t) {
  this.start = t;
  this.triggered = true;
}

AttackDecayEnvelope.prototype.getValue = function(t) {
  if (!this.triggered) {
    return 0;
  }

  function clamp(value) {
    return Math.min(1, Math.max(0, value));
  }

  var secondsIn = t - this.start;
  
  if (secondsIn <= this.attackTime) {
    return clamp(secondsIn / this.attackTime); 
  } else if (secondsIn <= (this.attackTime + this.decayTime)) {
    return clamp(1 - ((secondsIn - this.attackTime) / this.decayTime));  
  } else {
    return 0;
  }
  
}

/**
 * StepSequencer
 */
function StepSequencer(synth, bpm, pattern) {
  this.synth = synth;
  this.step = 0;
  this.bpm = bpm;
  this.pattern = pattern;
}

StepSequencer.prototype.run = function(t) {
  
  var step = Math.floor(t * this.bpm / 15) % this.pattern.length;
  
  if (step != this.step) {
    // next step
    this.step = step;
    var note = this.pattern[step];
    if (note) {
      this.synth.noteOn(t, note);
    }
  }
}

/**
 * Channel
 */
function Channel(inputDsp, amp) {
  this.amp = amp;
  this.inputDsp = inputDsp;
}

Channel.prototype.dsp = function(t) {
  return this.amp * this.inputDsp.dsp(t);
};
 
/**
 * Mixer
 */
function Mixer(masterVolume) {
  this.channels = [];
  this.masterVolume = masterVolume;
}

Mixer.prototype.dsp = function(t) {
  var sum = 0;
  for (var i = 0; i < this.channels.length; i++) {
    sum += this.channels[i].dsp(t);
  }
  
  return sum * this.masterVolume;
}

Mixer.prototype.addChannel = function(dsp, amp) {
  this.channels.push(new Channel(dsp, amp));
}


/**
 * Wave functions
 */
function sawtooth(t, freq) {
  return 2 * (t * freq - Math.floor(t * freq)) - 1;
}

function sine(t, freq) {
  return Math.sin(t * freq);
}


/**
 * ---------------------------
 * Main
 * ---------------------------
 */
var mainMixer = new Mixer(0.9);

var synth = new PolySynth(
  function () { 
    return new MonoSynth(sawtooth, new AttackDecayEnvelope(0.01, 0.2)); 
  }, 4);
  mainMixer.addChannel(synth, 0.2);

var bassDrum = new MonoSynth(sine, new AttackDecayEnvelope(0.0, 0.1));
bassDrum.setPitchEnvelope(new AttackDecayEnvelope(0.0, 0.2), 4);
var bassDrumSequencer = new StepSequencer(bassDrum, 120, ['a3', null, null, null]);
mainMixer.addChannel(bassDrum, 0.8);

var stepSequencer = new StepSequencer(
  synth, 120, [
    'a1', 'a2', 'a3', 'a2', 'a1', 'a2', 'a3', 'a2', 'a1', 'a2', 'a3', 'a2', 'a1', 'a2', 'a3', 'a2'
  ]);
  
var stepSequencer2 = new StepSequencer(
  synth, 120, [
    'c3', null, null, 'c3', null, null, 'g2', 'e2', null, null, 'e2', 'c1', null, 'c3', null, null
  ]);
  
export function dsp(t) {
  stepSequencer.run(t);
  stepSequencer2.run(t);
  bassDrumSequencer.run(t);
  
  return mainMixer.dsp(t);
}



