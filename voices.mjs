// Eight short calls per speaker; each cue is [offset, duration] in seconds.
const profiles={
  "classic": {
    "speaker": "Grady",
    "gender": "male",
    "file": "./audio/grady-v1.mp3",
    "cues": {
      "minimum": [
        0,
        0.56
      ],
      "quarter": [
        1,
        0.67
      ],
      "half": [
        2,
        0.69
      ],
      "check": [
        3,
        0.58
      ],
      "call": [
        4,
        0.66
      ],
      "fold": [
        5,
        0.65
      ],
      "allin": [
        6,
        0.82
      ],
      "raise": [
        7,
        0.55
      ]
    }
  },
  "calm": {
    "speaker": "Holden",
    "gender": "male",
    "file": "./audio/holden-v1.mp3",
    "cues": {
      "minimum": [
        0,
        0.62
      ],
      "quarter": [
        1,
        0.66
      ],
      "half": [
        2,
        0.74
      ],
      "check": [
        3,
        0.61
      ],
      "call": [
        4,
        0.67
      ],
      "fold": [
        5,
        0.84
      ],
      "allin": [
        6,
        0.86
      ],
      "raise": [
        7,
        0.76
      ]
    }
  },
  "bright": {
    "speaker": "Ainsley",
    "gender": "female",
    "file": "./audio/ainsley-v1.mp3",
    "cues": {
      "minimum": [
        0,
        0.68
      ],
      "quarter": [
        1,
        0.72
      ],
      "half": [
        2,
        0.62
      ],
      "check": [
        3,
        0.64
      ],
      "call": [
        4,
        0.7
      ],
      "fold": [
        5,
        0.66
      ],
      "allin": [
        6,
        0.83
      ],
      "raise": [
        7,
        0.58
      ]
    }
  }
};
for(const profile of Object.values(profiles)){
  for(const cue of Object.values(profile.cues))Object.freeze(cue);
  Object.freeze(profile.cues);Object.freeze(profile);
}
export const pokerVoiceStyles=Object.freeze(profiles);
