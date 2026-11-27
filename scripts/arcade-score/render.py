"""Render the original scores to stereo, gapless-tagged MP3 masters for the arcade."""
import argparse
import ctypes as ct
import ctypes.util
from dataclasses import dataclass
from functools import lru_cache
import hashlib
import math
from pathlib import Path
import random
import re
import subprocess

import numpy as np
from arrangements import SCORES

RATE = 44100
GM = {
    'piano':0, 'epiano':4, 'harpsichord':6, 'clav':7, 'celesta':8, 'musicbox':10,
    'vibes':11, 'marimba':12, 'dulcimer':15, 'organ':17, 'accordion':21, 'harmonica':22,
    'nylon':24, 'steel':25, 'jazzguitar':26, 'clean':27, 'mandolin':25,
    'upright':32, 'acousticbass':32, 'fingerbass':33, 'pickbass':34, 'fretless':35,
    'synthbass':38, 'violin':40, 'cello':42, 'lowstrings':42, 'tremolo':44, 'pizz':45,
    'harp':46, 'timpani':47, 'strings':48, 'softstrings':49, 'trumpet':56, 'tuba':58,
    'mutedtrumpet':59, 'horn':60, 'brass':61, 'tenor':66, 'oboe':68, 'bassoon':70,
    'clarinet':71, 'flute':73, 'shakuhachi':77, 'square':80, 'saw':81, 'warm':89,
    'polysynth':90, 'glass':98, 'banjo':105, 'koto':107, 'fiddle':110, 'steeldrum':114,
}
MAJOR = (0,2,4,5,7,9,11)
MODES = {'major':MAJOR, 'pentatonic':MAJOR, 'minor':(0,2,3,5,7,8,10),
         'dorian':(0,2,3,5,7,9,10), 'mixolydian':(0,2,4,5,7,9,10), 'lydian':(0,2,4,6,7,9,11)}
TONICS = {'C':0,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'F#':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11}
QUALITIES = {'':(0,4,7),'m':(0,3,7),'7':(0,4,7,10),'maj7':(0,4,7,11),'maj9':(0,4,7,11,14),
             'm7':(0,3,7,10),'m9':(0,3,7,10,14),'dim':(0,3,6,9),'sus':(0,5,7),
             'm6':(0,3,7,9),'add9':(0,4,7,14)}
# One cell is an eighth. Bass R/f/t/a = root, fifth, third, approach to the next
# root. Comp L/M/H/T picks chord tones, X/x strums, W holds. The last three
# patterns are independent low drum, snare/hand drum and high percussion parts.
@dataclass(frozen=True)
class Groove:
    bass: str
    comp: str
    low: str
    back: str
    high: str
    kit: tuple
    swing: float = 0
    rubato: float = 0.012


GROOVES = {
    'garden': Groove('R.......','L..M.H.T','........','........','........',(36,37,76),rubato=.041),
    'waltz': Groove('R.....','..x.x.','......','......','......',(36,38,51),rubato=.034),
    'noir': Groove('R.....a.','..X..x..','K.......','......s.','..h...h.',(36,37,51),.085,.025),
    'watercolor': Groove('R...f.','L.H..M','......','......','......',(36,37,54),rubato=.036),
    'clockwork': Groove('R..f..t.','L..H.M.T','K.....k.','....s...','.h...h..',(41,75,76),.012),
    'celestial': Groove('R.....','L..H.T','......','......','......',(36,37,81),rubato=.047),
    'disco': Groove('R.rff.ta','.x.x.X.x','K.k.K.k.','..S...S.','.h.h.h.h',(36,39,42)),
    'surf': Groove('R.f.t.fa','.x.X.x.X','K...K..k','..S...S.','h.h.h.hh',(36,38,42),.012),
    'rag': Groove('R...f..a','..X...x.','K...k...','..s...s.','h..h.h..',(36,37,51),.125),
    'minimal': Groove('R...f...','L..M.H.T','K.......','....s...','..h..h..',(36,37,42)),
    'breakbeat': Groove('R..r.f.a','.X..x.X.','K..k.K..','..S..sS.','h.hh.hh.',(36,40,42)),
    'court': Groove('R.....','L...H.','K.....','....s.','......',(47,64,76),rubato=.045),
    'chamber': Groove('R.....','L.M.H.','......','......','......',(36,38,51),rubato=.043),
    'brush': Groove('R.t.f.a.','..x..X..','K.......','..s...s.','h.h.h..h',(36,38,51),.16,.022),
    'manouche': Groove('R...f.a.','X.x.X.x.','........','..s...s.','h..h.h..',(36,37,42),.115),
    'western': Groove('R..ff..a','L..x.M.x','K..kK...','....s...','..h...h.',(41,37,54),.035),
    'march': Groove('R..rR.fa','X...L.X.','K...K..k','..s..ss.','h...h...',(36,38,49)),
    'madang': Groove('R..f..','L.M.H.','K..k..','..s.s.','...h.h',(47,64,53),.06),
    'musette': Groove('R.....','..X.x.','K.....','....s.','..h...',(36,37,54),.032,.031),
    'expedition': Groove('R..fR.fa','L.M..H.T','K..k..k.','..s...s.','h..h.h..',(41,63,54)),
    'bossa': Groove('R..rf..f','X..x..x.','K..kK...','..s..s..','h.h.h.h.',(36,37,70),.014,.021),
    'folk': Groove('R..f..','L..M.H','K...k.','..s..s','...h..',(45,62,54),.075,.024),
    'bayou': Groove('R..f..a.','.x..X..x','K....k..','..s...s.','h..h.h..',(36,37,75),.12),
    'suspense': Groove('R..r..f.','L...M..H','K....k..','....s...','..h..h..',(41,37,51)),
    'drift': Groove('R','L','', '', '',(36,38,51),rubato=.058),
    'pageant': Groove('R.f.R..a','X..x..X.','K...k...','..s...s.','....h...',(36,38,54),.024),
    'ballad': Groove('R.....f.','L..M.H.T','........','........','........',(36,38,54),rubato=.044),
    'motown': Groove('R.trf.ta','.X..x.X.','K..kK...','..S...S.','h.h.h.hh',(36,39,54),.045),
    'oddwaltz': Groove('R....a','..x..X','K.....','...s..','..h...',(36,37,42),.085,.031),
    'spy': Groove('R.r..f.a','.X..x..X','K..k.K..','..s...S.','h.h..h.h',(36,37,42),.035),
    'acoustic': Groove('R...f..a','L..x.M.x','K.......','....s...','..h...h.',(36,37,70),.04,.026),
    'tango': Groove('R..f.a','X..x.X','K..k..','....s.','......',(36,37,54),.015,.035),
    'shadow': Groove('R.....','L...H.','......','....s.','......',(41,76,81),rubato=.039),
}


@lru_cache(maxsize=None)
def harmony(symbol, tonic):
    accidental, degree, quality = re.fullmatch(r'([b#]?)([1-7])(.*)',symbol).groups()
    pitch = tonic + MAJOR[int(degree)-1] + {'b':-1,'#':1,'':0}[accidental]
    return pitch, QUALITIES[quality]


def nearest(pitch, centre):
    return pitch + 12 * round((centre-pitch)/12)


def voice_chord(root, intervals, previous):
    # Search close inversions, minimizing total hand movement across this change.
    pcs = [root+n for n in intervals]
    if len(pcs) == 5:
        pcs.pop(2)  # The bass supplies the foundation; leave room for the ninth.
    candidates = []
    for first in range(len(pcs)):
        pitches = [nearest(pcs[first],57)]
        for offset in range(1,len(pcs)):
            note = pcs[(first+offset)%len(pcs)]
            pitches.append(pitches[-1]+1+(note-pitches[-1]-1)%12)
        for shift in (-12,0,12):
            voicing = tuple(p+shift for p in pitches)
            if not 48 <= voicing[0] <= 68 or voicing[-1] > 82:
                continue
            cost = sum(abs(p-previous[min(i,len(previous)-1)]) for i,p in enumerate(voicing))
            candidates.append((cost,voicing))
    return min(candidates)[1]


def scale_pitch(degree, tonic, scale):
    octave, index = divmod(degree-1,7)
    return 60+tonic+12*octave+scale[index]


def sequence(key, score):
    tonic, scale = TONICS[score.tonic], MODES[score.mode]
    groove = GROOVES[score.groove]
    rng = random.Random(key)
    charts = [line.split() for line in score.chords.split(' / ')]
    themes = [line.split() for line in score.phrases.split(' / ')]
    assert all(len(line)==4 for line in charts+themes)
    form = [ord(section)-65 for section in score.form]
    chords = [harmony(symbol,tonic) for section in form for symbol in charts[section]]
    voices = score.instruments.split()
    melody_shift = -12 if voices[0] in ('cello','bassoon','lowstrings','tenor','horn') or tonic>=8 else 0
    events = []
    def add(start, length, channel, note, velocity):
        start = max(0,start)
        vel = max(1,min(122,round(velocity+rng.uniform(-3,3))))
        events.append((start,1,channel,note,vel))
        events.append((start+max(.04,length),0,channel,note,0))
    clock, shape, visits = 0., (53,57,62,65), [0,0,0]
    for section_index, section in enumerate(form):
        repeat = visits[section]; visits[section] += 1
        swell = [0,6,10][section] + (3 if repeat else 0)
        for bar, line in enumerate(themes[section]):
            number = section_index*4+bar
            root, intervals = chords[number]
            next_root = chords[(number+1)%len(chords)][0]
            shape = voice_chord(root,intervals,shape)
            width = score.beats*2
            line = line.ljust(width,'.')
            assert len(line)==width and set(line)<=set('123456789abcdef-.'),(key,line)
            # Breathe into cadences and lightly push the middle of the phrase.
            beat = (60/score.bpm)*(1+groove.rubato*([.25,-.6,-.4,1.1][bar]+.35*math.sin(number)))
            def at(cell):
                return clock+(cell*.5+(groove.swing if cell%2 else 0))*beat
            def lead(cell, degree, cells):
                pitch=scale_pitch(degree,tonic,scale)+melody_shift
                duration=cells*.5*beat
                level=78+swell+2*math.sin(math.pi*cell/width)+(4 if cell==0 else 0)
                add(at(cell)+rng.uniform(-.009,.009),duration*(.81 if cells==1 else .96),0,pitch,level)
                if section==2 and bar in (1,3) and cells>=3:
                    # Split octave/third colour on long notes; never double every attack.
                    add(at(cell)+.055,duration*.86,1,nearest(scale_pitch(max(1,degree-2),tonic,scale),67),54)
            for i,ch in enumerate(line):
                if ch in '.-': continue
                end=i+1
                while end<width and line[end]=='-': end+=1
                lead(i,int(ch,16),end-i)
            # A second player answers the written silences. The answering phrase
            # follows the local harmony and moves in the opposite register.
            if section!=0 or repeat:
                for i in range(1,width-1):
                    if line[i:i+2]=='..' and line[i-1]!='.':
                        add(at(i)+.04,.40*beat,1,nearest(shape[(bar+1)%len(shape)],70),61+swell//3)
                        add(at(i+1)+.025,.47*beat,1,nearest(shape[bar%len(shape)],68),55+swell//3)
                if repeat and bar==2:
                    add(at(width-2),beat*.93,1,nearest(shape[-1],73),55)
            sparse = section_index==0 or (section==2 and bar==0)
            for i,mark in enumerate(groove.bass):
                if mark=='.' or (sparse and i>0 and mark not in 'f'): continue
                base=nearest(root,42)
                bass={'R':base,'r':base+12,'t':nearest(root+intervals[1],46),
                      'f':nearest(root+7,46),'a':nearest(next_root,43)-1}[mark]
                next_hit=next((j for j in range(i+1,len(groove.bass)) if groove.bass[j]!='.'),width)
                length=(next_hit-i)*.5*beat*(.85 if score.groove in ('drift','garden','court','chamber','celestial','ballad') else .69)
                add(at(i)+.008,length,3,bass,76+(5 if i==0 else -3)+swell//3)
            for i,mark in enumerate(groove.comp):
                if mark=='.': continue
                if mark in 'Xx':
                    order=shape if (number+i)%2 else tuple(reversed(shape))
                    for j,pitch in enumerate(order):
                        add(at(i)+j*.011+rng.uniform(0,.004),beat*(.52 if mark=='X' else .30),2,pitch,57+swell//3+(4 if mark=='X' else -2))
                else:
                    idx={'L':0,'M':1,'H':-1,'T':-2}[mark]
                    length=beat*(2.7 if score.groove=='drift' else 1.19)
                    add(at(i)+.014,length,2,shape[idx]+(12 if mark=='T' and section==1 else 0),62+swell//3)
            # The sustained voice enters after the opening statement and recedes
            # around the cadence. Do not put strings behind every game or bar.
            if (section==1 and bar!=3) or (section==2 and repeat and bar in (0,2)):
                for pitch in (shape[0],shape[-1]):
                    add(at(0)+.10,beat*(score.beats-.35),4,pitch,47+swell//3)
            if score.groove=='drift' and bar in (1,3):
                add(at(width-3)+.13,1.35*beat,1,nearest(shape[-1],74),53)
            for row,(pattern,drum) in enumerate(zip((groove.low,groove.back,groove.high),groove.kit)):
                if row==2 and sparse: continue
                for i,ch in enumerate(pattern):
                    if ch=='.': continue
                    if row==1 and sparse and i%4: continue
                    strength=(79,64,51)[row] + (6 if ch.isupper() else -5)+swell//2
                    add(at(i)+rng.uniform(0,.012),.12,9,drum,strength)
            if section!=0 and bar==3 and groove.high.strip('.') and groove.back.strip('.'):
                for i in (width-2,width-1):
                    add(at(i)+.012,.09,9,groove.kit[1] if i==width-1 else groove.kit[2],51+(i%2)*8)
            clock+=beat*score.beats
    return sorted(events),clock


class Synth:
    """Small binding to the system FluidSynth library, with an offline sample clock."""
    def __init__(self, bank, score):
        self.lib=ct.CDLL(ctypes.util.find_library('fluidsynth') or 'libfluidsynth.so.3')
        ptr, integer = ct.c_void_p, ct.c_int
        signatures={
            'new_fluid_settings':(ptr,[]), 'new_fluid_synth':(ptr,[ptr]),
            'fluid_settings_setnum':(integer,[ptr,ct.c_char_p,ct.c_double]),
            'fluid_settings_setint':(integer,[ptr,ct.c_char_p,integer]),
            'fluid_synth_sfload':(integer,[ptr,ct.c_char_p,integer]),
            'fluid_synth_program_select':(integer,[ptr,integer,integer,integer,integer]),
            'fluid_synth_cc':(integer,[ptr,integer,integer,integer]),
            'fluid_synth_noteon':(integer,[ptr,integer,integer,integer]),
            'fluid_synth_noteoff':(integer,[ptr,integer,integer]),
            'fluid_synth_write_float':(integer,[ptr,integer,ptr,integer,integer,ptr,integer,integer]),
            'delete_fluid_synth':(None,[ptr]), 'delete_fluid_settings':(None,[ptr]),
        }
        for name,(restype,args) in signatures.items():
            fn=getattr(self.lib,name); fn.restype=restype; fn.argtypes=args
        self.settings=self.lib.new_fluid_settings()
        self.lib.fluid_settings_setnum(self.settings,b'synth.sample-rate',RATE)
        self.lib.fluid_settings_setnum(self.settings,b'synth.gain',.55)
        self.lib.fluid_settings_setint(self.settings,b'synth.cpu-cores',1)
        self.synth=self.lib.new_fluid_synth(self.settings)
        sf=self.lib.fluid_synth_sfload(self.synth,str(bank).encode(),1)
        if sf<0: raise RuntimeError(f'Cannot load {bank}')
        for ch,(instrument,pan,volume,room) in enumerate(zip(score.instruments.split(),
                (64,78,43,60,83),(105,82,84,92,65),(38,42,27,14,43))):
            if self.lib.fluid_synth_program_select(self.synth,ch,sf,0,GM[instrument])<0:
                raise ValueError(instrument)
            for controller,value in [(10,pan),(7,volume),(91,room),(93,9)]:
                self.lib.fluid_synth_cc(self.synth,ch,controller,value)
        kit = 40 if score.groove in ('brush','noir','watercolor') else 0
        if self.lib.fluid_synth_program_select(self.synth,9,sf,128,kit)<0:
            raise ValueError(f'Missing percussion kit {kit}')
        self.lib.fluid_synth_cc(self.synth,9,7,85)

    def render(self, events, duration):
        frames=round(duration*RATE)
        out=np.zeros((frames+3*RATE,2),dtype=np.float32)
        frame=0
        def advance(end):
            nonlocal frame
            if end>frame:
                addr=out.ctypes.data+frame*8
                self.lib.fluid_synth_write_float(self.synth,end-frame,addr,0,2,addr,1,2)
                frame=end
        # If an overlapping note is re-articulated, its previous note-off must
        # not cut off the new note. Hold the key until the last release instead.
        active={}
        for time,on,ch,note,velocity in events:
            advance(round(time*RATE))
            pair=ch,note
            if on:
                active[pair]=active.get(pair,0)+1
                self.lib.fluid_synth_noteon(self.synth,ch,note,velocity)
            else:
                active[pair]-=1
                if active[pair]==0: self.lib.fluid_synth_noteoff(self.synth,ch,note)
        advance(len(out))
        tail=out[frames:]
        tail*=np.linspace(1,0,len(tail),dtype=np.float32)[:,None]
        out[:len(tail)]+=tail
        return out[:frames]

    def close(self):
        self.lib.delete_fluid_synth(self.synth)
        self.lib.delete_fluid_settings(self.settings)


def master(key, bank, dest):
    score=SCORES[key]
    events,duration=sequence(key,score)
    synth=Synth(bank,score)
    try:
        samples=synth.render(events,duration)
    finally:
        synth.close()
    # Set a background listening level and keep headroom for game effects.
    rms=np.sqrt(np.mean(samples*samples))
    if rms<.0001: raise ValueError(f'Silent track: {key}')
    samples*=.10/rms
    samples[:]=.82*np.tanh(samples/.82)
    tmp=dest/(key+'.tmp.mp3')
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','f32le','-ar',str(RATE),
        '-ac','2','-i','pipe:0','-c:a','libmp3lame','-q:a','5','-write_xing','1',
        '-metadata','title='+score.title,'-metadata','artist=오쭈다','-metadata','album=오쭈다 오락실',str(tmp)],
        input=samples.tobytes(),check=True)
    tmp.replace(dest/(key+'.mp3'))
    print(f'{key:14} {duration:5.1f}s   {score.title}',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output',type=Path)
    parser.add_argument('--bank',type=Path,default=Path('/usr/share/sounds/sf2/FluidR3_GM.sf2'))
    parser.add_argument('--games',nargs='+',choices=sorted(SCORES))
    args=parser.parse_args()
    # All published masters use the same acoustic recordings on every runner.
    if hashlib.sha256(args.bank.read_bytes()).hexdigest()!='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0':
        raise ValueError('Expected the FluidR3 GM General MIDI bank, version 3.1')
    args.output.mkdir(parents=True,exist_ok=True)
    for key in args.games or SCORES:
        master(key,args.bank,args.output)


if __name__=='__main__':
    main()
